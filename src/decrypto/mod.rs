use std::{
    collections::HashMap,
    ops::{Index, IndexMut},
};

use rand::{Rng, seq::IndexedRandom};
use serde::{Deserialize, Serialize};

use crate::{
    decrypto::settings::GameSettings,
    id::UserId,
    message::{ChatMessage, Clue, CurrentRound},
};

pub mod settings;

/// Global game state
pub struct GameState {}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct Team(pub bool);
impl Team {
    pub const WHITE: Self = Self(false);
    pub const BLACK: Self = Self(true);
    pub const ORDER: [Self; 2] = [Self::WHITE, Self::BLACK];

    pub fn other(self) -> Self {
        Self(!self.0)
    }

    pub fn index(self) -> usize {
        self.0 as usize
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    Encryptor,
    Decryptor,
}

#[derive(Debug, Clone, Default)]
pub struct GameInfo {
    /// Settings for the game.
    pub settings: GameSettings,
    pub global_chat: Vec<ChatMessage>,
    ///  All players that have ever been in this game.
    players: HashMap<UserId, GamePlayerInfo>,
    pub state: GameInfoState,
}

impl GameInfo {
    pub fn add_player(&mut self, user_id: UserId) {
        self.players.insert(user_id, GamePlayerInfo::default());
    }

    /// Also used when the player leaves the game themselves.
    pub fn kick_player(&mut self, user_id: UserId) {
        let info = self.players.get_mut(&user_id).expect("Should exist");
        let old_team = match self.state {
            GameInfoState::Lobby => None,
            GameInfoState::InGame { .. } => info.access_to_info(),
        };
        *info = GamePlayerInfo::LeftGame(old_team);
    }

    pub fn players(&self) -> &HashMap<UserId, GamePlayerInfo> {
        &self.players
    }

    /// XXX: This is a hack to allow modifying players in dev code.
    pub fn hack_players_mut(&mut self) -> &mut HashMap<UserId, GamePlayerInfo> {
        &mut self.players
    }

    pub fn startable(&self) -> Result<(), String> {
        if !matches!(self.state, GameInfoState::Lobby) {
            return Err("Only games in lobby can be started".to_owned());
        }

        if self
            .players
            .values()
            .any(|info| matches!(info, GamePlayerInfo::NotInTeam))
        {
            return Err("All players must join a team before starting the game".to_owned());
        }

        for team in Team::ORDER {
            if self
                .players
                .values()
                .filter(|info| **info == GamePlayerInfo::InTeam(team))
                .count()
                < 2
            {
                return Err("Each team must have at least 2 players".to_owned());
            }
        }

        self.settings.validate()
    }

    pub fn players_in_team(&self, team: Team) -> Vec<UserId> {
        self.players
            .iter()
            .filter_map(|(id, info)| {
                if *info == GamePlayerInfo::InTeam(team) {
                    Some(*id)
                } else {
                    None
                }
            })
            .collect()
    }

    pub fn team_for_user(&self, user_id: UserId) -> Option<Team> {
        self.players
            .get(&user_id)
            .and_then(|info| info.access_to_info())
    }

    pub fn start(&mut self) {
        debug_assert!(self.startable().is_ok());

        let (kw_a, kw_b) = self.settings.pick_random_keywords();

        self.state = GameInfoState::InGame {
            teams: [TeamInGame { keywords: kw_a }, TeamInGame { keywords: kw_b }],
            completed_rounds: Vec::new(),
            current_round: Some(Round::from(Team::ORDER.map(|team| {
                RoundPerTeam {
                    // Pick a random encryptor for the team.
                    encryptor: self
                        .players_in_team(team)
                        .choose(&mut rand::rng())
                        .expect("There should be at least one player in each team")
                        .clone(),
                    code: self.settings.make_random_code(),
                    clues: None,
                    decipher: None,
                    intercept: None,
                }
            }))),
            phase: Phase::Encrypt,
        };
    }

    pub fn proceed_if_ready(&mut self) {
        let GameInfoState::InGame {
            completed_rounds,
            current_round,
            phase,
            ..
        } = &mut self.state
        else {
            return;
        };

        // TODO
        match *phase {
            Phase::Encrypt => {
                let round = current_round.as_ref().expect("Invalid state");
                if Team::ORDER
                    .iter()
                    .filter(|team| round[**team].clues.is_some())
                    .count()
                    == 2
                {
                    // Both teams have given clues, proceed to intercept phase, or decipher phase if first round
                    if completed_rounds.is_empty() {
                        *phase = Phase::Decipher(Team::WHITE);
                    } else {
                        *phase = Phase::Intercept(Team::WHITE);
                    }
                }
            }
            Phase::Decipher(team_to_decipher) => {
                let round = current_round.as_ref().expect("Invalid state");
                if round[team_to_decipher].decipher.is_some() {
                    if team_to_decipher == Team::WHITE {
                        *phase = Phase::Intercept(Team::BLACK);
                    } else {
                        self.next_round();
                    }
                }
            }
            Phase::Intercept(team_to_intercept) => {
                let round = current_round.as_ref().expect("Invalid state");
                if round[team_to_intercept.other()].intercept.is_some() {
                    *phase = Phase::Decipher(team_to_intercept);
                }
            }
            _ => {}
        }
    }

    fn next_round(&mut self) {
        let players_in_teams = PerTeam::from(Team::ORDER.map(|team| self.players_in_team(team)));
        let GameInfoState::InGame {
            completed_rounds,
            current_round,
            phase,
            ..
        } = &mut self.state
        else {
            panic!("Cannot proceed to next round in non-in-game state");
        };

        // Move current round to completed rounds.
        let ended_round = current_round
            .take()
            .expect("Cannot proceed to next round without current round");
        completed_rounds.push(ended_round.clone());
        *phase = Phase::Encrypt;
        *current_round = Some(Round::from(Team::ORDER.map(|team| {
            // Pick a the next encryptor for the team.
            let players = &players_in_teams[team];
            let prev_i = players
                .iter()
                .position(|p| *p == ended_round[team].encryptor)
                .expect("Encryptor should be in the team");
            let next_i = (prev_i + 1) % players.len();

            RoundPerTeam {
                encryptor: players[next_i].clone(),
                code: self.settings.make_random_code(),
                clues: None,
                decipher: None,
                intercept: None,
            }
        })));
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GamePlayerInfo {
    /// Recently joined and not in a team yet.
    #[default]
    NotInTeam,
    /// Player is in a team.
    InTeam(Team),
    /// Player left the game, or was kicked from it.
    /// They can rejoin later, in which case the team will stay the same.
    /// This prevents a kicked player from rejoining a game with a different team.
    /// If you're kicked while in a lobby, this will be `LeftGame(None)` as no info has been given yet.
    LeftGame(Option<Team>),
}
impl GamePlayerInfo {
    /// Returns the team of the player, if they are in a team.
    pub fn access_to_info(&self) -> Option<Team> {
        match self {
            GamePlayerInfo::InTeam(team) => Some(*team),
            GamePlayerInfo::LeftGame(team) => *team,
            _ => None,
        }
    }
}

/// State-specific information about the game.
#[derive(Debug, Clone, Default)]
pub enum GameInfoState {
    #[default]
    Lobby,
    /// Game that's started.
    InGame {
        teams: [TeamInGame; 2],
        completed_rounds: Vec<Round>,
        current_round: Option<Round>,
        phase: Phase,
    },
}

/// Per-team private information, some of which is only visible to the encryptor.
#[derive(Debug, Clone)]
pub struct TeamInGame {
    /// Keywords for the team
    pub keywords: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct PerTeam<T>(pub [T; 2]);

impl<T> From<[T; 2]> for PerTeam<T> {
    fn from(v: [T; 2]) -> Self {
        Self(v)
    }
}

impl<T> Index<Team> for PerTeam<T> {
    type Output = T;

    fn index(&self, team: Team) -> &Self::Output {
        &self.0[team.index()]
    }
}
impl<T> IndexMut<Team> for PerTeam<T> {
    fn index_mut(&mut self, team: Team) -> &mut Self::Output {
        &mut self.0[team.index()]
    }
}

pub type Round = PerTeam<RoundPerTeam>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct RoundPerTeam {
    pub encryptor: UserId,
    pub code: Vec<usize>,
    /// `None` if the team ran out of time, or has not given clues yet.
    pub clues: Option<Vec<Clue>>,
    /// `None` if the team ran out of time, or has not guessed yet.
    pub decipher: Option<Vec<usize>>,
    /// Intercept attempt submitted by this team.
    /// `None` if the team ran out of time, or has not intercepted yet.
    pub intercept: Option<Vec<usize>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    /// Encryptor is giving clues.
    /// Done after both teams have given clues,
    /// or when the time runs out.
    Encrypt,
    /// The team marks the team whose clues is being intercepted.
    Intercept(Team),
    /// The team guesses their own teams code.
    Decipher(Team),
    /// TODO: Tiebreaker phase.
    Tiebreaker,
    GameOver,
}
