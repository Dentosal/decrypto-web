use std::time::Instant;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    decrypto::{
        Code, PerTeam, Role, Round, RoundPerTeam, RoundResult, Team, TiebreakerRound,
        settings::GameSettings,
    },
    id::{GameId, UserId, UserSecret},
};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FromClient {
    Auth {
        secret: Option<UserSecret>,
    },
    SetNick(String),
    CreateLobby,
    JoinLobby(GameId),
    LeaveLobby,
    JoinTeam(Team),
    Kick(UserId),
    StartGame,
    SubmitClues(Vec<Clue>),
    SubmitDecipher(Code),
    SubmitIntercept(Code),
    SubmitTiebreaker(Vec<String>),
    TriggerTimers,
    Frustrated {
        /// Is this about guessing or encrypting?
        encrypting: bool,
        /// Teams the frustration is about.
        teams: PerTeam<bool>,
    },
    GlobalChat(String),
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ToClient {
    State {
        user_info: UserInfo,
        game: Option<GameView>,
    },
    Error {
        message: String,
        severity: ErrorSeverity,
    },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct UserInfo {
    pub id: UserId,
    pub secret: UserSecret,
    pub nick: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct PlayerInfo {
    pub id: UserId,
    /// Whether the player is connected to the game.
    pub connected: bool,
    /// If the player is still in the game lobby.
    /// Note that a disconnected player is still considerent present if they have not been kicked.
    /// If `false`, the player has been kicked or has left the game otherwise.
    pub is_in_game: bool,
    //// Nickname of the player.
    pub nick: String,
    /// None for the players that have not joined a team yet, or have been kicked.
    pub team: Option<Team>,
}

/// Game view from the perspective of single user.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct GameView {
    pub id: GameId,
    pub settings: GameSettings,
    /// All players that have ever been in this game.
    pub players: Vec<PlayerInfo>,
    pub global_chat: Vec<ChatMessage>,
    #[serde(flatten)]
    pub state: GameStateView,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum GameStateView {
    Lobby {
        reason_not_startable: Option<String>,
    },
    InGame {
        /// Complete rounds (public info).
        completed_rounds: Vec<PerTeam<CompletedRoundPerTeam>>,
        /// Current round (partially public info). None if the game is in tiebreaker state.
        current_round: Option<PerTeam<CurrentRoundPerTeam>>,
        /// Keywords for this team (private info).
        keywords: Vec<String>,
        /// Inputs for the current player
        inputs: Inputs,
    },
    /// Game is over, all info is public.
    GameOver {
        keywords: PerTeam<Vec<String>>,
        completed_rounds: Vec<PerTeam<CompletedRoundPerTeam>>,
        tiebreaker: Option<TiebreakerRound>,
    },
    /// The game is in progress, but you're not in a team.
    InGameNotInTeam,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct CompletedRoundPerTeam {
    /// All non-computed properties. Rest are derived from it.
    #[serde(flatten)]
    pub non_computed: RoundPerTeam,
    pub score: RoundResult,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct CurrentRoundPerTeam {
    pub encryptor: UserId,
    /// `None` if the team ran out of time, or has not given clues yet.
    pub clues: Option<Vec<Clue>>,
    /// `None` if the team ran out of time, or has not guessed yet.
    /// Only visible for the team themselves.
    pub decipher: Option<Code>,
    /// `None` if the team ran out of time, or has not intercepted yet.
    /// Only visible for the team themselves.
    pub intercept: Option<Code>,
}

/// Game view from the perspective of single user.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct ChatMessage {
    /// None for server messages.
    pub author: Option<UserId>,
    pub text: String,
}
impl ChatMessage {
    pub fn system(text: String) -> Self {
        Self { author: None, text }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorSeverity {
    Info,
    Warning,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Clue {
    Text(String),
    Image(Uuid),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Inputs {
    Encrypt {
        code: Code,
        deadline: Option<Deadline>,
    },
    Guess {
        intercept: bool,
        decipher: bool,
        deadline: Option<Deadline>,
    },
    WaitingForEncryptors {
        /// True for teams that are done yet.
        teams: PerTeam<bool>,
        deadline: Option<Deadline>,
    },
    WaitingForGuessers {
        /// True for teams that are done yet.
        teams: PerTeam<bool>,
        deadline: Option<Deadline>,
    },
    Tiebreaker {
        teams_done: PerTeam<bool>,
        deadline: Option<Deadline>,
    },
    /// Game is over, only input is moving back to the lobby.
    GameOver,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct Deadline {
    #[serde(with = "serde_millis")]
    pub at: Instant,
    /// Reason for the deadline.
    pub reason: DeadlineReason,
}

/// Reason for the deadline.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DeadlineReason {
    /// The deadline is fiex.
    Fixed,
    /// The other team has finished their part.
    OtherFinished,
    /// Ohter team has clicked the "Hurry up!" button.
    Frustrated,
}
