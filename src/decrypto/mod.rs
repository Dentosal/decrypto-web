use std::{
    collections::HashMap,
    fmt,
    ops::{Index, IndexMut},
    time::Instant,
    vec,
};

use rand::{Rng, seq::IndexedRandom};
use serde::{Deserialize, Serialize};

use crate::{
    decrypto::settings::GameSettings,
    id::{DrawingId, UserId},
    message::{ChatMessage, Clue, CurrentRoundPerTeam, Deadline, DeadlineReason},
};

mod code;
pub mod settings;

pub use code::Code;

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

impl fmt::Display for Team {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "team:{}", self.0 as u8)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    Encryptor,
    Decryptor,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct RoundResult {
    /// `None` - didn't attempt to intercept.
    /// `Some(true)` - intercepted successfully.
    /// `Some(false)` - interception failed.
    pub intercept: Option<bool>,
    /// Whether the decipher attempt was correct.
    pub decipher: bool,
}

impl fmt::Display for RoundResult {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "decipher {}",
            if self.decipher { "ok" } else { "failed" }
        )?;

        if let Some(intercept) = self.intercept {
            write!(f, ", intercept {}", if intercept { "ok" } else { "failed" })
        } else {
            write!(f, "")
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct GameInfo {
    /// Settings for the game.
    pub settings: GameSettings,
    pub global_chat: Vec<ChatMessage>,
    ///  All players that have ever been in this game.
    players: HashMap<UserId, GamePlayerInfo>,
    /// Drawings in this game lobby, in png format.
    pub drawings: HashMap<DrawingId, Vec<u8>>,
    /// State of the game.
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
            GameInfoState::InGame { .. } => info.access_to_info(),
            _ => None,
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

        self.state = GameInfoState::InGame {
            keywords: self.settings.pick_random_keywords(),
            completed_rounds: Vec::new(),
            current_round: GameInfoStateCurrentRound::Normal(Round::from(Team::ORDER.map(
                |team| {
                    RoundPerTeam {
                        // Pick a random encryptor for the team.
                        encryptor: *self
                            .players_in_team(team)
                            .choose(&mut rand::rng())
                            .expect("There should be at least one player in each team"),
                        code: self.settings.make_random_code(),
                        clues: None,
                        decipher: None,
                        intercept: None,
                        timed_out: TimedOut::default(),
                    }
                },
            ))),
            deadlines: PerTeam::from_fn(|_| {
                self.settings.encrypt_time_limit.fixed.map(|dl| Deadline {
                    at: Instant::now() + dl,
                    reason: DeadlineReason::Fixed,
                })
            }),
        };
    }

    #[must_use]
    pub fn next_round_if_ready(&mut self) -> Option<PerTeam<RoundResult>> {
        let GameInfoState::InGame {
            completed_rounds,
            current_round,
            ..
        } = &mut self.state
        else {
            panic!("Cannot proceed to next round in non-in-game state");
        };

        let GameInfoStateCurrentRound::Normal(current_round) = current_round else {
            panic!("Cannot proceed to next round in tiebreaker state");
        };
        let is_done = current_round.both(|r| {
            (r.clues.is_some() || r.timed_out.encrypt.is_some())
                && ((r.decipher.is_some()
                    && (r.intercept.is_some() || completed_rounds.is_empty()))
                    || r.timed_out.guess.is_some())
        });
        if !is_done {
            return None;
        }

        let players_in_teams = PerTeam::from(Team::ORDER.map(|team| self.players_in_team(team)));
        let GameInfoState::InGame {
            keywords,
            completed_rounds,
            current_round,
            deadlines,
            ..
        } = &mut self.state
        else {
            panic!("Cannot proceed to next round in non-in-game state");
        };

        // Move current round to completed rounds.
        let GameInfoStateCurrentRound::Normal(ended_round) = current_round else {
            panic!("Cannot proceed to next round in tiebreaker state");
        };
        completed_rounds.push(ended_round.clone());
        let score = ended_round.score();

        // Check if score-based win conditions are met.
        let aggr = aggregate_scores(completed_rounds.iter().map(|rt| rt.score()));
        let intercept_win = aggr.map(|score| score.intercepts >= self.settings.intercept_limit);
        let miscommunication_loss =
            aggr.map(|score| score.miscommunications >= self.settings.miscommunication_limit);

        if intercept_win.either(|b| *b) || miscommunication_loss.either(|b| *b) {
            // Game is over, but it require a tiebreaker, if scores don't differ
            let [a, b] = aggr.map(|score| score.total()).0;
            if a == b {
                let keywords = keywords.clone();
                let completed_rounds = completed_rounds.clone();
                self._start_tiebreaker(keywords, completed_rounds);
                return Some(score);
            }

            let winner = if a > b { Team::WHITE } else { Team::BLACK };

            // If one team lost, move to game over state.
            self.state = GameInfoState::GameOver {
                winner: Some(winner),
                keywords: keywords.clone(),
                completed_rounds: completed_rounds.clone(),
                tiebreaker: None,
            };
            return Some(score);
        }

        // Check if round limit is reached.
        if let Some(round_limit) = self.settings.round_limit
            && completed_rounds.len() >= round_limit
        {
            let keywords = keywords.clone();
            let completed_rounds = completed_rounds.clone();
            self._start_tiebreaker(keywords, completed_rounds);
            return Some(score);
        }

        // Otherwise, start a new round.
        *current_round = GameInfoStateCurrentRound::Normal(Round::from(Team::ORDER.map(|team| {
            // Pick a the next encryptor for the team.
            let players = &players_in_teams[team];
            let prev_i = players
                .iter()
                .position(|p| *p == ended_round[team].encryptor)
                .expect("Encryptor should be in the team");
            let next_i = (prev_i + 1) % players.len();

            RoundPerTeam {
                encryptor: players[next_i],
                code: self.settings.make_random_code(),
                clues: None,
                decipher: None,
                intercept: None,
                timed_out: TimedOut::default(),
            }
        })));

        *deadlines = PerTeam::splat(
            self.settings
                .encrypt_time_limit
                .fixed
                .map(|limit| Deadline {
                    at: Instant::now() + limit,
                    reason: DeadlineReason::Fixed,
                }),
        );

        Some(score)
    }

    fn _start_tiebreaker(
        &mut self,
        keywords: PerTeam<Vec<String>>,
        completed_rounds: Vec<PerTeam<RoundPerTeam>>,
    ) {
        // Enter tiebreaker state.
        self.state = GameInfoState::InGame {
            keywords,
            completed_rounds,
            current_round: GameInfoStateCurrentRound::Tiebreaker(TiebreakerRound::from(
                Team::ORDER.map(|_| TiebreakerRoundPerTeam {
                    guesses: vec![None; self.settings.keyword_count],
                    timed_out: None,
                }),
            )),
            deadlines: PerTeam::from_fn(|_| {
                self.settings
                    .tiebreaker_time_limit
                    .fixed
                    .map(|dl| Deadline {
                        at: Instant::now() + dl,
                        reason: DeadlineReason::Fixed,
                    })
            }),
        };
    }

    #[must_use]
    pub fn tiebreaker_over_if_ready(&mut self) -> Option<PerTeam<usize>> {
        let GameInfoState::InGame {
            keywords,
            completed_rounds,
            current_round,
            ..
        } = &mut self.state
        else {
            panic!("Cannot proceed to next round in non-in-game state");
        };

        let GameInfoStateCurrentRound::Tiebreaker(tiebreaker) = current_round else {
            panic!("Tiebreaker is not in progress");
        };

        if !tiebreaker.both(|r| r.guesses.iter().all(|g| g.is_some()) || r.timed_out.is_some()) {
            return None;
        }

        let scores = Team::ORDER.map(|team| {
            tiebreaker[team]
                .guesses
                .iter()
                .zip(keywords[team.other()].iter())
                .filter(|(guess, correct)| {
                    guess
                        .as_ref()
                        .map(|guess| check_tiebreaker_guess(guess, correct))
                        .unwrap_or(false)
                })
                .count()
        });

        self.state = GameInfoState::GameOver {
            winner: if scores[0] > scores[1] {
                Some(Team::WHITE)
            } else if scores[0] < scores[1] {
                Some(Team::BLACK)
            } else {
                None
            },
            keywords: keywords.clone(),
            completed_rounds: completed_rounds.clone(),
            tiebreaker: Some(tiebreaker.clone()),
        };

        Some(scores.into())
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
        keywords: PerTeam<Vec<String>>,
        completed_rounds: Vec<Round>,
        /// Current round, `None` if the game is in tiebreaker state.
        current_round: GameInfoStateCurrentRound,
        deadlines: PerTeam<Option<Deadline>>,
    },
    /// Game over, results are available.
    GameOver {
        winner: Option<Team>,
        keywords: PerTeam<Vec<String>>,
        completed_rounds: Vec<Round>,
        tiebreaker: Option<TiebreakerRound>,
    },
}

#[derive(Debug, Clone)]
pub enum GameInfoStateCurrentRound {
    Normal(Round),
    Tiebreaker(TiebreakerRound),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct PerTeam<T>(pub [T; 2]);

impl<T: Clone> PerTeam<T> {
    pub fn splat(t: T) -> Self {
        PerTeam([t.clone(), t])
    }
}
impl<T> PerTeam<T> {
    pub fn from_fn(f: impl Fn(Team) -> T) -> Self {
        PerTeam(Team::ORDER.map(f))
    }

    pub fn either(&self, f: impl Fn(&T) -> bool) -> bool {
        self.0.iter().any(f)
    }

    pub fn both(&self, f: impl Fn(&T) -> bool) -> bool {
        self.0.iter().all(f)
    }

    pub fn map<R>(self, f: impl Fn(T) -> R) -> PerTeam<R> {
        PerTeam(self.0.map(f))
    }

    pub fn as_ref(&self) -> PerTeam<&T> {
        PerTeam([&self.0[0], &self.0[1]])
    }

    pub fn as_mut(&mut self) -> PerTeam<&mut T> {
        let [a, b] = &mut self.0;
        PerTeam([a, b])
    }
}

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

impl PerTeam<bool> {
    pub fn teams(self) -> impl Iterator<Item = Team> {
        Team::ORDER.into_iter().filter(move |t| self.0[t.index()])
    }
}

pub type Round = PerTeam<RoundPerTeam>;
pub type TiebreakerRound = PerTeam<TiebreakerRoundPerTeam>;

impl PerTeam<RoundPerTeam> {
    pub fn score(&self) -> PerTeam<RoundResult> {
        PerTeam(Team::ORDER.map(|team| {
            let decipher = match self[team].decipher.as_ref() {
                Some(attempt) => *attempt == self[team].code,
                None => true,
            };

            let intercept = self[team]
                .intercept
                .as_ref()
                .map(|attempt| *attempt == self[team.other()].code);

            RoundResult {
                intercept,
                decipher,
            }
        }))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct AggregateScore {
    pub miscommunications: usize,
    pub intercepts: usize,
}
impl AggregateScore {
    pub fn total(&self) -> i32 {
        self.intercepts as i32 - self.miscommunications as i32
    }
}

fn aggregate_scores(it: impl Iterator<Item = PerTeam<RoundResult>>) -> PerTeam<AggregateScore> {
    it.fold(
        PerTeam::splat(AggregateScore {
            miscommunications: 0,
            intercepts: 0,
        }),
        |acc, round| {
            PerTeam(Team::ORDER.map(|team| AggregateScore {
                miscommunications: acc[team].miscommunications + (!round[team].decipher) as usize,
                intercepts: acc[team].intercepts
                    + round[team].intercept.map(|b| b as usize).unwrap_or(0),
            }))
        },
    )
}

impl<T> fmt::Display for PerTeam<T>
where
    T: fmt::Display,
{
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "<team:0>: {}\n<team:1>: {}",
            self[Team::WHITE],
            self[Team::BLACK]
        )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct RoundPerTeam {
    pub encryptor: UserId,
    pub code: Code,
    /// `None` if the team ran out of time, or has not given clues yet.
    pub clues: Option<Vec<Clue>>,
    /// `None` if the team ran out of time, or has not guessed yet.
    pub decipher: Option<Code>,
    /// Intercept attempt submitted by this team.
    /// `None` if the team ran out of time, or has not intercepted yet.
    pub intercept: Option<Code>,
    pub timed_out: TimedOut,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct TimedOut {
    pub encrypt: Option<DeadlineReason>,
    pub guess: Option<DeadlineReason>,
}
impl TimedOut {
    pub fn set_next(&mut self, reason: DeadlineReason) {
        if self.encrypt.is_none() {
            self.encrypt = Some(reason);
        } else if self.guess.is_none() {
            self.guess = Some(reason);
        } else {
            panic!("Cannot set more than two timeouts");
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct TiebreakerRoundPerTeam {
    /// `None` if the team ran out of time, or has not given clues yet.
    pub guesses: Vec<Option<String>>,
    pub timed_out: Option<DeadlineReason>,
}

pub fn check_tiebreaker_guess(guess: &str, correct: &str) -> bool {
    guess.trim().eq_ignore_ascii_case(correct.trim())
}
