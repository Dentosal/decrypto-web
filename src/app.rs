use std::{collections::HashMap, fmt::format, hash::Hash, option, time::Instant};

use axum::extract::ws::WebSocket;
use futures::{SinkExt, stream::SplitSink};
use rand::seq::IndexedRandom;
use serde::{Deserialize, Serialize};

use crate::{
    decrypto::{
        GameInfo, GameInfoState, GamePlayerInfo, GameState, PerTeam, Team, settings::GameSettings,
    },
    id::{ConnectionId, GameId, UserId, UserSecret},
    message::{
        ChatMessage, CompletedRoundPerTeam, CurrentRoundPerTeam, Deadline, DeadlineReason,
        ErrorSeverity, FromClient, GameStateView, GameView, Inputs, PlayerInfo, ToClient, UserInfo,
    },
};

#[derive(Default)]
pub struct State {
    clients: HashMap<ConnectionId, ClientData>,
    users: HashMap<UserId, UserData>,
    games: HashMap<GameId, GameInfo>,
}

pub struct ClientData {
    outbound: SplitSink<WebSocket, axum::extract::ws::Message>,
    authenticated_as: Option<UserId>,
}

pub struct UserData {
    /// Null if not connected at the moment.
    connection_id: Option<ConnectionId>,
    /// Secret used to authenticate the user.
    secret: UserSecret,
    /// User-given nickname.
    nick: Option<String>,
    /// Joined game, if any.
    game: Option<GameId>,
}

impl State {
    pub async fn send_to_connection(&mut self, id: ConnectionId, msg: ToClient) {
        log::debug!("Sending message to client {id:?}: {:?}", msg);
        let msg = axum::extract::ws::Message::Text(serde_json::to_string(&msg).unwrap().into());
        let client = self.clients.get_mut(&id).expect("Client should exist");
        let _ = client.outbound.send(msg).await;
    }

    pub async fn send_error<S>(&mut self, id: ConnectionId, msg: S, severity: ErrorSeverity)
    where
        S: Into<String>,
    {
        self.send_to_connection(
            id,
            ToClient::Error {
                message: msg.into(),
                severity,
            },
        )
        .await;
    }

    #[must_use]
    async fn require_auth(&mut self, connnection_id: ConnectionId) -> Result<UserId, ()> {
        if let Some(user_id) = self
            .clients
            .get(&connnection_id)
            .expect("Should exist")
            .authenticated_as
        {
            Ok(user_id)
        } else {
            self.send_error(connnection_id, "Auth required", ErrorSeverity::Error)
                .await;
            Err(())
        }
    }

    #[must_use]
    async fn require_game(
        &mut self,
        connnection_id: ConnectionId,
        user_id: UserId,
    ) -> Result<GameId, ()> {
        if let Some(game_id) = self.users.get(&user_id).expect("Should exist").game {
            Ok(game_id)
        } else {
            self.send_error(connnection_id, "You are not in a game", ErrorSeverity::Info)
                .await;
            Err(())
        }
    }

    pub async fn on_connect(
        &mut self,
        id: ConnectionId,
        outbound: SplitSink<WebSocket, axum::extract::ws::Message>,
    ) {
        self.clients.insert(
            id,
            ClientData {
                outbound,
                authenticated_as: None,
            },
        );
    }

    pub async fn on_disconnect(&mut self, id: ConnectionId) {
        let client = self.clients.remove(&id).expect("Should exist");
        if let Some(user_id) = client.authenticated_as {
            let user_data = self.users.get_mut(&user_id).expect("Should exist");
            user_data.connection_id = None;
            if let Some(game_id) = user_data.game {
                self.broadcast_game_state(game_id).await;
            }
        }
    }

    fn find_client_by_secret(&mut self, secret: UserSecret) -> Option<UserId> {
        for (user_id, user_data) in &self.users {
            if user_data.secret == secret {
                debug_assert!(self.users.get(user_id).is_some());
                return Some(*user_id);
            }
        }
        return None;
    }

    fn game_from_user_perspective(&self, user_id: UserId) -> Option<GameView> {
        let user_data = self.users.get(&user_id).expect("Should exist");

        user_data.game.map(|game_id| {
            let game_info = self.games.get(&game_id).expect("Should exist");

            let mut players: Vec<_> = game_info
                .players()
                .iter()
                .map(|(player_id, info)| {
                    let player_info = self.users.get(player_id).expect("Should exist");
                    PlayerInfo {
                        id: *player_id,
                        connected: player_info.connection_id.is_some(),
                        nick: player_info.nick.clone().expect("Should exist"),
                        team: match info {
                            GamePlayerInfo::InTeam(team) => Some(*team),
                            _ => None,
                        },
                        is_in_game: match info {
                            GamePlayerInfo::LeftGame(_) => false,
                            _ => true,
                        },
                    }
                })
                .collect();
            players.sort_by_key(|p| p.id);

            let state = match &game_info.state {
                GameInfoState::Lobby => GameStateView::Lobby {
                    reason_not_startable: game_info.startable().err().map(|e| e.to_owned()),
                },
                GameInfoState::InGame {
                    keywords,
                    completed_rounds,
                    current_round,
                    deadlines,
                } => {
                    if let Some(team) = game_info.team_for_user(user_id) {
                        GameStateView::InGame {
                            keywords: keywords[team].clone(),
                            completed_rounds: completed_rounds
                                .iter()
                                .map(|round| {
                                    let score = round.score();
                                    PerTeam::from_fn(|t| CompletedRoundPerTeam {
                                        non_computed: round[t].clone(),
                                        score: score[t],
                                    })
                                })
                                .collect(),
                            current_round: current_round.as_ref().map(|round| {
                                PerTeam::from_fn(|t| CurrentRoundPerTeam {
                                    encryptor: round[t].encryptor,
                                    clues: round[t].clues.clone(),
                                    decipher: if t == team {
                                        round[t].decipher.clone()
                                    } else {
                                        None
                                    },
                                    intercept: if t == team {
                                        round[t].intercept.clone()
                                    } else {
                                        None
                                    },
                                })
                            }),
                            inputs: if let Some(current_round) = current_round {
                                let is_encryptor = current_round[team].encryptor == user_id;
                                if current_round
                                    .both(|r| r.clues.is_some() || r.timed_out.encrypt.is_some())
                                {
                                    let decipher =
                                        current_round[team].decipher.is_none() && !is_encryptor;
                                    let intercept = current_round[team].intercept.is_none()
                                        && !completed_rounds.is_empty();
                                    if !current_round[team].timed_out.guess.is_some()
                                        && (decipher || intercept)
                                    {
                                        Inputs::Guess {
                                            intercept,
                                            decipher,
                                            deadline: deadlines[team].clone(),
                                        }
                                    } else {
                                        Inputs::WaitingForGuessers {
                                            teams: PerTeam::from_fn(|team| {
                                                current_round[team].decipher.is_none()
                                                    || (current_round[team].intercept.is_none()
                                                        && !completed_rounds.is_empty())
                                            }),
                                            deadline: deadlines[team.other()].clone(),
                                        }
                                    }
                                } else {
                                    if !current_round[team].timed_out.encrypt.is_some()
                                        && current_round[team].clues.is_none()
                                        && is_encryptor
                                    {
                                        Inputs::Encrypt {
                                            code: current_round[team].code.clone(),
                                            deadline: deadlines[team].clone(),
                                        }
                                    } else {
                                        Inputs::WaitingForEncryptors {
                                            teams: current_round
                                                .clone()
                                                .map(|round| round.clues.is_none()),
                                            deadline: deadlines[team.other()].clone(),
                                        }
                                    }
                                }
                            } else {
                                Inputs::RoundNotActive
                            },
                        }
                    } else {
                        GameStateView::InGameNotInTeam
                    }
                }
            };

            GameView {
                id: game_id,
                global_chat: game_info.global_chat.clone(),
                players,
                state,
                settings: game_info.settings.clone(),
            }
        })
    }

    /// Gather latest state view and send it to the user.
    async fn send_state_to_user(&mut self, user_id: UserId) {
        let user_data = self.users.get(&user_id).expect("Should exist");

        let game = self.game_from_user_perspective(user_id);

        let state = ToClient::State {
            user_info: UserInfo {
                id: user_id,
                secret: user_data.secret.clone(),
                nick: user_data.nick.clone(),
            },
            game,
        };
        self.send_to_connection(user_data.connection_id.expect("Should exist"), state)
            .await;
    }

    async fn broadcast_game_state(&mut self, game_id: GameId) {
        let users_in_game: Vec<_> = self
            .games
            .get(&game_id)
            .expect("Game should exist")
            .players()
            .keys()
            .copied()
            .collect();
        for user_id in users_in_game {
            if self
                .users
                .get(&user_id)
                .expect("Should exist")
                .connection_id
                .is_none()
            {
                continue; // Don't send state to users that are not connected.
            }
            self.send_state_to_user(user_id).await;
        }
    }

    pub async fn on_message(&mut self, id: ConnectionId, msg: FromClient) -> Result<(), ()> {
        match msg {
            FromClient::Auth { secret } => {
                let user_id = if let Some(secret) = secret {
                    if let Some(user_id) = self.find_client_by_secret(secret) {
                        log::debug!("Client {id:?} auth ok, user {user_id:?}");
                        self.users
                            .get_mut(&user_id)
                            .expect("Should exist")
                            .connection_id = Some(id);
                        Some(user_id)
                    } else {
                        log::debug!("Client {id:?} secret not recognized");
                        self.send_to_connection(
                            id,
                            ToClient::Error {
                                message: "Your previous session has expired".to_owned(),
                                severity: ErrorSeverity::Info,
                            },
                        )
                        .await;
                        None
                    }
                } else {
                    log::debug!("Client {id:?} auth without secret");
                    None
                };

                let user_id = match user_id {
                    Some(user_id) => user_id,
                    None => {
                        // Create a new user with a random secret.
                        let user_id = UserId::new();
                        let secret = UserSecret::new();
                        log::debug!("Client {id:?} creating new user, id {user_id:?}");
                        self.users.insert(
                            user_id,
                            UserData {
                                connection_id: Some(id),
                                secret,
                                nick: None,
                                game: None,
                            },
                        );
                        user_id
                    }
                };

                self.clients
                    .get_mut(&id)
                    .expect("Should exist")
                    .authenticated_as = Some(user_id);

                self.send_state_to_user(user_id).await;
                Ok(())
            }
            FromClient::SetNick(nick) => {
                let user_id = self.require_auth(id).await?;
                if nick.len() < 2 || nick.len() > 64 {
                    self.send_error(
                        id,
                        "Nickname must be between 2 and 64 characters",
                        ErrorSeverity::Info,
                    )
                    .await;
                    return Ok(());
                }

                let user_data = self.users.get_mut(&user_id).expect("Should exist");
                let old_nick = user_data.nick.replace(nick);
                if let Some(game_id) = user_data.game {
                    let old_nick = old_nick.expect("In game, should have a nick");
                    self.games
                        .get_mut(&game_id)
                        .expect("Should exist")
                        .global_chat
                        .push(ChatMessage::system(format!(
                            "<{user_id}> changed nick (was {old_nick})",
                        )));
                    self.broadcast_game_state(game_id).await;
                } else {
                    self.send_state_to_user(user_id).await;
                }
                Ok(())
            }
            FromClient::CreateLobby => {
                let user_id = self.require_auth(id).await?;

                if self
                    .users
                    .get_mut(&user_id)
                    .expect("Should exist")
                    .game
                    .is_some()
                {
                    self.send_error(id, "You are already in a game", ErrorSeverity::Info)
                        .await;
                    return Ok(());
                }

                let game_id = GameId::new();
                log::debug!("Client {id:?} creating a new lobby {game_id:?}");

                let mut game_info = GameInfo::default();
                game_info.add_player(user_id);
                game_info.global_chat.push(ChatMessage::system(format!(
                    "<{user_id}> created a new lobby"
                )));
                self.games.insert(game_id, game_info);

                self.users.get_mut(&user_id).expect("Should exist").game = Some(game_id);

                self.send_state_to_user(user_id).await;

                Ok(())
            }
            FromClient::JoinLobby(game_id) => {
                let user_id = self.require_auth(id).await?;

                let Some(game_info) = self.games.get_mut(&game_id) else {
                    self.send_error(id, "Game not found", ErrorSeverity::Info)
                        .await;
                    return Err(());
                };
                let game_has_started = matches!(game_info.state, GameInfoState::InGame { .. });

                // TODO: hack_players_mut
                if let Some(player_info) = game_info.hack_players_mut().get_mut(&user_id) {
                    if !game_has_started {
                        // If the game is in lobby phase, just rejoin.
                        *player_info = GamePlayerInfo::NotInTeam;
                        self.users.get_mut(&user_id).expect("Should exist").game = Some(game_id);
                    } else {
                        match player_info {
                            GamePlayerInfo::NotInTeam => {
                                // TODO: force team selection in frontend.
                                self.send_error(
                                    id,
                                    "Game in progress, rejoin team selection not implemented yet",
                                    ErrorSeverity::Error,
                                )
                                .await;
                                return Err(());
                            }
                            GamePlayerInfo::InTeam(team) => {
                                panic!(
                                    "Invaraint violation: user {user_id} already in team {team:?} in game {game_id:?}"
                                );
                            }
                            GamePlayerInfo::LeftGame(None) => {
                                // TODO: force team selection in frontend.
                                self.send_error(
                                    id,
                                    "Game in progress, rejoin team selection not implemented yet",
                                    ErrorSeverity::Error,
                                )
                                .await;
                                return Err(());
                            }
                            GamePlayerInfo::LeftGame(Some(team)) => {
                                // Rejoin the team.
                                self.users.get_mut(&user_id).expect("Should exist").game =
                                    Some(game_id);
                                *player_info = GamePlayerInfo::InTeam(*team);
                            }
                        }
                    }
                } else {
                    game_info.add_player(user_id);
                    self.users.get_mut(&user_id).expect("Should exist").game = Some(game_id);
                }

                game_info
                    .global_chat
                    .push(ChatMessage::system(format!("<{user_id}> joined the lobby")));

                self.broadcast_game_state(game_id).await;
                Ok(())
            }
            FromClient::LeaveLobby => {
                let user_id = self.require_auth(id).await?;
                let game_id = self.require_game(id, user_id).await?;

                let user_data = self.users.get_mut(&user_id).expect("Should exist");
                let game_info = self.games.get_mut(&game_id).expect("Should exist");
                game_info.kick_player(user_id);
                user_data.game = None;

                game_info
                    .global_chat
                    .push(ChatMessage::system(format!("<{user_id}> left the lobby")));

                self.broadcast_game_state(game_id).await;
                self.send_state_to_user(user_id).await;
                Ok(())
            }
            FromClient::JoinTeam(team) => {
                let user_id = self.require_auth(id).await?;
                let game_id = self.require_game(id, user_id).await?;

                let game_info = self.games.get_mut(&game_id).expect("Should exist");

                // TODO: allow joining games if the player has not been in a team yet.
                if !matches!(game_info.state, GameInfoState::Lobby) {
                    self.send_error(id, "Cannot change teams while in game", ErrorSeverity::Info)
                        .await;
                    return Err(());
                }

                // TODO
                *game_info
                    .hack_players_mut()
                    .get_mut(&user_id)
                    .expect("Should exist") = GamePlayerInfo::InTeam(team);
                self.broadcast_game_state(game_id).await;
                Ok(())
            }
            FromClient::Kick(kick_user_id) => {
                let user_id = self.require_auth(id).await?;
                let game_id = self.require_game(id, user_id).await?;

                let game_info = self.games.get_mut(&game_id).expect("Should exist");
                if !game_info.players().contains_key(&kick_user_id) {
                    self.send_error(id, "User not in game", ErrorSeverity::Info)
                        .await;
                    return Err(());
                }

                // Only allow kicking users that are not connected, for now.
                let kick_user_data = self.users.get(&kick_user_id).expect("Should exist");
                if kick_user_data.connection_id.is_some() {
                    self.send_error(
                        id,
                        "You can only kick users that are not connected",
                        ErrorSeverity::Info,
                    )
                    .await;
                    return Err(());
                }

                // Mark player as kicked. If in game, store the team so they must re-join it again if joining later.
                game_info.kick_player(kick_user_id);

                game_info.global_chat.push(ChatMessage::system(format!(
                    "Disconnected <{kick_user_id}> was kicked the game by <{user_id}>"
                )));

                let kick_user_data = self.users.get_mut(&kick_user_id).expect("Should exist");
                kick_user_data.game = None;
                self.broadcast_game_state(game_id).await;
                Ok(())
            }
            FromClient::StartGame => {
                let user_id = self.require_auth(id).await?;
                let game_id = self.require_game(id, user_id).await?;

                let game_info = self.games.get_mut(&game_id).expect("Should exist");
                if let Err(e) = game_info.startable() {
                    self.send_to_connection(
                        id,
                        ToClient::Error {
                            message: e.to_owned(),
                            severity: ErrorSeverity::Info,
                        },
                    )
                    .await;
                    return Err(());
                }

                game_info.start();
                self.broadcast_game_state(game_id).await;
                Ok(())
            }
            FromClient::SubmitClues(clues) => {
                let user_id = self.require_auth(id).await?;
                let game_id = self.require_game(id, user_id).await?;

                let game_info = self.games.get_mut(&game_id).expect("Should exist");
                if let Some(team) = game_info.team_for_user(user_id) {
                    if let GameInfoState::InGame { current_round, .. } = &mut game_info.state {
                        let Some(current_round) = current_round else {
                            self.send_error(id, "No round in progress", ErrorSeverity::Info)
                                .await;
                            return Err(());
                        };

                        // Only allow sending clues if the user is the encryptor for their team.
                        if current_round[team].encryptor != user_id {
                            self.send_error(
                                id,
                                "You are not the encryptor for your team",
                                ErrorSeverity::Info,
                            )
                            .await;
                            return Err(());
                        }

                        // Require correct number of clues.
                        if clues.len() != game_info.settings.clue_count {
                            self.send_error(
                                id,
                                "Incorrect number of clues submitted",
                                ErrorSeverity::Info,
                            )
                            .await;
                            return Err(());
                        }

                        // TODO: Validate clues.
                        // * Reusing clues is not allowed.
                        // * Clues must be unique.
                        // * Clues must be valid according to the game settings.
                        // * Clues must not be empty.
                        // * Clues must not be too long.
                        // * Clues must not contain team keywords.

                        // Check for resubmission.
                        if current_round[team].clues.is_some() {
                            // Already submitted clues, cannot submit again.
                            self.send_error(id, "Clues already submitted", ErrorSeverity::Info)
                                .await;
                            return Err(());
                        }

                        // Success.
                        game_info.global_chat.push(ChatMessage::system(format!(
                            "<{user_id}> submitted clues {clues:?}"
                        )));
                        current_round[team].clues = Some(clues);
                        self.broadcast_game_state(game_id).await;
                        Ok(())
                    } else {
                        self.send_error(id, "Gaem not in progress", ErrorSeverity::Info)
                            .await;
                        Err(())
                    }
                } else {
                    self.send_error(id, "You are not in a team", ErrorSeverity::Info)
                        .await;
                    Err(())
                }
            }
            FromClient::SubmitDecipher(attempt) => {
                let user_id = self.require_auth(id).await?;
                let game_id = self.require_game(id, user_id).await?;

                let game_info = self.games.get_mut(&game_id).expect("Should exist");
                if let Some(team) = game_info.team_for_user(user_id) {
                    if let GameInfoState::InGame { current_round, .. } = &mut game_info.state {
                        let Some(current_round) = current_round else {
                            self.send_error(id, "No round in progress", ErrorSeverity::Info)
                                .await;
                            return Err(());
                        };

                        if current_round[team].encryptor == user_id {
                            self.send_error(
                                id,
                                "You are not allowed to submit decipher clues as an encryptor",
                                ErrorSeverity::Info,
                            )
                            .await;
                            return Err(());
                        }

                        // Require correct number of clues.
                        if attempt.len() != game_info.settings.clue_count {
                            self.send_error(id, "Incorrect format", ErrorSeverity::Info)
                                .await;
                            return Err(());
                        }

                        // TODO: Validate more:
                        // * Correct range
                        // * No duplicates

                        // Check for resubmission.
                        if current_round[team].decipher.is_some() {
                            // Already submitted, cannot submit again.
                            self.send_error(id, "Decipher already submitted", ErrorSeverity::Info)
                                .await;
                            return Err(());
                        }

                        // Success.
                        current_round[team].decipher = Some(attempt);
                        if let Some(result) = game_info.next_round_if_ready() {
                            game_info.global_chat.push(ChatMessage::system(format!(
                                "Round ended, scores:\n{result}"
                            )));
                        }
                        self.broadcast_game_state(game_id).await;
                        Ok(())
                    } else {
                        self.send_error(id, "Gaem not in progress", ErrorSeverity::Info)
                            .await;
                        Err(())
                    }
                } else {
                    self.send_error(id, "You are not in a team", ErrorSeverity::Info)
                        .await;
                    Err(())
                }
            }
            FromClient::SubmitIntercept(attempt) => {
                let user_id = self.require_auth(id).await?;
                let game_id = self.require_game(id, user_id).await?;

                let game_info = self.games.get_mut(&game_id).expect("Should exist");
                if let Some(team) = game_info.team_for_user(user_id) {
                    if let GameInfoState::InGame {
                        current_round,
                        completed_rounds,
                        ..
                    } = &mut game_info.state
                    {
                        if completed_rounds.is_empty() {
                            self.send_error(
                                id,
                                "Cannot intercept in the first round",
                                ErrorSeverity::Info,
                            )
                            .await;
                            return Err(());
                        }

                        let Some(current_round) = current_round else {
                            self.send_error(id, "No round in progress", ErrorSeverity::Info)
                                .await;
                            return Err(());
                        };

                        // Require correct number of clues.
                        if attempt.len() != game_info.settings.clue_count {
                            self.send_error(id, "Incorrect format", ErrorSeverity::Info)
                                .await;
                            return Err(());
                        }

                        // TODO: Validate more:
                        // * Correct range
                        // * No duplicates

                        // Check for resubmission.
                        if current_round[team].intercept.is_some() {
                            // Already submitted, cannot submit again.
                            self.send_error(id, "Intercept already submitted", ErrorSeverity::Info)
                                .await;
                            return Err(());
                        }

                        // Success.
                        current_round[team].intercept = Some(attempt);
                        if let Some(result) = game_info.next_round_if_ready() {
                            game_info.global_chat.push(ChatMessage::system(format!(
                                "Round ended, scores:\n{result}"
                            )));
                        }
                        self.broadcast_game_state(game_id).await;
                        Ok(())
                    } else {
                        self.send_error(id, "Gaem not in progress", ErrorSeverity::Info)
                            .await;
                        Err(())
                    }
                } else {
                    self.send_error(id, "You are not in a team", ErrorSeverity::Info)
                        .await;
                    Err(())
                }
            }
            FromClient::TriggerTimers => {
                let user_id = self.require_auth(id).await?;
                let game_id = self.require_game(id, user_id).await?;

                let game_info = self.games.get_mut(&game_id).expect("Should exist");
                let GameInfoState::InGame {
                    current_round,
                    deadlines,
                    ..
                } = &mut game_info.state
                else {
                    self.send_error(id, "Game not in progress", ErrorSeverity::Info)
                        .await;
                    return Err(());
                };
                let Some(current_round) = current_round else {
                    self.send_error(id, "No round in progress", ErrorSeverity::Info)
                        .await;
                    return Err(());
                };

                let now = Instant::now();

                let mut any_changes = false;
                for team in Team::ORDER {
                    if let Some(deadline) = &deadlines[team] {
                        if deadline.at < now {
                            // Deadline has expired, enforce it.
                            any_changes = true;
                            current_round[team].timed_out.set_next(deadline.reason);
                            deadlines[team] = None;
                            continue;
                        }
                    }
                }

                if any_changes {
                    self.broadcast_game_state(game_id).await;
                }

                Ok(())
            }
            FromClient::Frustrated { encrypting, teams } => {
                let user_id = self.require_auth(id).await?;
                let game_id = self.require_game(id, user_id).await?;

                let game_info = self.games.get_mut(&game_id).expect("Should exist");
                let GameInfoState::InGame {
                    current_round,
                    deadlines,
                    ..
                } = &mut game_info.state
                else {
                    self.send_error(id, "Game not in progress", ErrorSeverity::Info)
                        .await;
                    return Err(());
                };
                let Some(current_round) = current_round else {
                    self.send_error(id, "No round in progress", ErrorSeverity::Info)
                        .await;
                    return Err(());
                };

                // IF the current deadline has expired, enforce it.
                // Otherwise, start the frustration timer.

                let now = Instant::now();

                for team in teams.teams() {
                    if let Some(deadline) = &deadlines[team] {
                        if deadline.at < now {
                            // Deadline has expired, enforce it.
                            current_round[team].timed_out.set_next(deadline.reason);
                            deadlines[team] = None;
                            continue;
                        }
                    }
                    // Start the frustration timer.
                    deadlines[team] = Some(Deadline {
                        at: now
                            + if encrypting {
                                game_info.settings.encrypt_time_limit.after_frustrated
                            } else {
                                game_info.settings.guess_time_limit.after_frustrated
                            },
                        reason: DeadlineReason::Frustrated,
                    });
                    game_info.global_chat.push(ChatMessage::system(format!(
                        "<{user_id}> is frustrated with team <{team}>"
                    )));
                }

                self.broadcast_game_state(game_id).await;

                Err(())
            }
            FromClient::GlobalChat(message) => {
                let user_id = self.require_auth(id).await?;
                let game_id = self.require_game(id, user_id).await?;

                if message.len() >= 4096 {
                    self.send_error(id, "Message too long", ErrorSeverity::Info)
                        .await;
                    return Err(());
                }

                let game_info = self.games.get_mut(&game_id).expect("Should exist");
                game_info.global_chat.push(ChatMessage {
                    author: Some(user_id),
                    text: message,
                });
                self.broadcast_game_state(game_id).await;
                Ok(())
            }
        }
    }
}
