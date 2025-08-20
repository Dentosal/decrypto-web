use std::{array, collections::HashMap, fs, time::Duration};

use rand::seq::SliceRandom;
use serde::{Deserialize, Serialize};

use crate::decrypto::{Code, PerTeam, Team};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct GameSettings {
    /// How soon start tiebreaker/draw procedure.
    /// Default 8. Min 3.
    pub round_limit: Option<usize>,
    // How many keywords to show in the game.
    /// Default 4. Min 4.
    pub keyword_count: usize,
    /// How many clues per round. Also code length.
    /// Default 3. Min 3. Max `keyword_count`.
    pub clue_count: usize,
    /// How clues are given.
    pub clue_mode: ClueMode,
    /// Keyword list to use for the game.
    /// `/wordlists` returns a list of available wordlists.
    pub wordlist: String,
    /// Miscommunication limit before losing.
    /// Default 2. Min 1. Max `round_limit - 1`.
    pub miscommunication_limit: usize,
    /// Intercept limit before winning, default 2.
    /// Default 2. Min 1. Max `round_limit - 2`.
    pub intercept_limit: usize,
    /// When to do tiebreaker round.
    pub tiebreaker: Tiebreaker,
    /// Timer for encryptors to encrypt clues.
    pub encrypt_time_limit: EncryptTimeLimit,
    /// Time to decide decipher and intercept attempts.
    pub guess_time_limit: GuessTimeLimit,
    /// Time to do tiebreaker.
    pub tiebreaker_time_limit: GuessTimeLimit,
}
impl Default for GameSettings {
    fn default() -> Self {
        Self {
            round_limit: Some(8),
            keyword_count: 4,
            clue_count: 3,
            clue_mode: Default::default(),
            wordlist: "original".to_string(),
            miscommunication_limit: 2,
            intercept_limit: 2,
            tiebreaker: Tiebreaker::default(),
            encrypt_time_limit: Default::default(),
            guess_time_limit: Default::default(),
            tiebreaker_time_limit: Default::default(),
        }
    }
}
impl GameSettings {
    pub fn validate(&self) -> Result<(), String> {
        if let Some(round_limit) = self.round_limit {
            if round_limit < 3 {
                return Err("Round limit must be at least 3".to_string());
            }
        }
        if self.miscommunication_limit < 1 {
            return Err("Miscommunication limit must be at least 1".to_string());
        }
        if self.intercept_limit < 1 {
            return Err("Intercept limit must be at least 1".to_string());
        }
        if self.intercept_limit >= self.round_limit.unwrap_or(usize::MAX) - 1 {
            return Err(format!(
                "Intercept limit must be less than round limit minus 1, got {}",
                self.intercept_limit
            ));
        }
        if self.miscommunication_limit >= self.round_limit.unwrap_or(usize::MAX) - 1 {
            return Err(format!(
                "Miscommunication limit must be less than round limit minus 1, got {}",
                self.miscommunication_limit
            ));
        }
        if self.keyword_count < 4 {
            return Err("Keyword count must be at least 4".to_string());
        }
        if self.clue_count < 2 || self.clue_count > self.keyword_count {
            return Err(format!(
                "Clue count must be between 2 and {}",
                self.keyword_count
            ));
        }

        if !available_wordlists().contains(&self.wordlist) {
            return Err(format!("Wordlist '{}' does not exist", self.wordlist));
        }

        Ok(())
    }

    /// Note that the code used zero-based indexing.
    pub fn make_random_code(&self) -> Code {
        let mut data: Vec<_> = (0..self.keyword_count).collect();
        data.shuffle(&mut rand::rng());
        data.truncate(self.clue_count);
        Code(data)
    }

    pub fn pick_random_keywords(&self) -> PerTeam<Vec<String>> {
        let mut keywords = self.load_wordlist();
        assert!(keywords.len() >= self.keyword_count);

        keywords.shuffle(&mut rand::rng());
        keywords.truncate(self.keyword_count * 2);
        let other = keywords.split_off(self.keyword_count);
        PerTeam::from([keywords, other])
    }

    pub fn load_wordlist(&self) -> Vec<String> {
        assert!(
            available_wordlists().contains(&self.wordlist),
            "Wordlist '{}' does not exist",
            self.wordlist
        );
        let path = format!("./wordlists/{}.txt", self.wordlist);
        let Ok(wordlist) = fs::read_to_string(path) else {
            return vec![];
        };
        wordlist
            .lines()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect()
    }
}

pub fn available_wordlists() -> Vec<String> {
    match fs::read_dir("./wordlists") {
        Ok(entries) => entries
            .flatten()
            .filter_map(|entry| {
                let path = entry.path();
                if path.is_file() {
                    if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                        file_name.strip_suffix(".txt").map(|s| s.to_owned())
                    } else {
                        None
                    }
                } else {
                    None
                }
            })
            .collect(),
        Err(_) => vec![],
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ClueMode {
    Text,
    Draw,
    #[default]
    Either,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct EncryptTimeLimit {
    /// Fixed upper limit.
    pub fixed: Option<Duration>,
    /// Timer that starts after the team is done.
    pub after_other: Option<Duration>,
    /// Timer that starts after the team marks frustration.
    pub after_frustrated: Duration,
}
impl Default for EncryptTimeLimit {
    fn default() -> Self {
        Self {
            fixed: None,
            after_other: None,
            // after_frustrated: Duration::from_secs(60),
            after_frustrated: Duration::from_secs(10),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct GuessTimeLimit {
    /// Fixed upper limit.
    pub fixed: Option<Duration>,
    /// Timer that starts after the team marks frustration.
    pub after_frustrated: Duration,
}
impl Default for GuessTimeLimit {
    fn default() -> Self {
        Self {
            fixed: None,
            after_frustrated: Duration::from_secs(60),
        }
    }
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Tiebreaker {
    /// Do tiebreaker round normally, i.e. when a draw would occur.
    #[default]
    OnDraw,
    /// Never do tiebreaker round.
    Never,
    /// Always do tiebreaker round, even if other team wins, just for fun.
    Always,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_settings_are_valid() {
        let settings = GameSettings::default();
        assert!(settings.validate().is_ok());
    }
}
