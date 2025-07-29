use std::{array, collections::HashMap, time::Duration};

use rand::seq::SliceRandom;
use serde::{Deserialize, Serialize};

use crate::decrypto::Team;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct GameSettings {
    /// How soon start tiebreaker/draw procedure.
    /// Default 8.
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
    pub keyword_list: KeywordList,
    /// Timer for encryptors to encrypt clues.
    pub encrypt_time_limit: EncryptTimeLimit,
    /// Time to decide intercept attempt.
    pub intercept_time_limit: GuessTimeLimit,
    /// Time to decide guess attempt.
    pub decipher_time_limit: GuessTimeLimit,
}
impl Default for GameSettings {
    fn default() -> Self {
        Self {
            round_limit: Some(8),
            keyword_count: 4,
            clue_count: 3,
            clue_mode: Default::default(),
            keyword_list: Default::default(),
            encrypt_time_limit: Default::default(),
            intercept_time_limit: Default::default(),
            decipher_time_limit: Default::default(),
        }
    }
}
impl GameSettings {
    pub fn validate(&self) -> Result<(), String> {
        if self.keyword_count < 4 {
            return Err("Keyword count must be at least 4".to_string());
        }
        if self.clue_count < 2 || self.clue_count > self.keyword_count {
            return Err(format!(
                "Clue count must be between 2 and {}",
                self.keyword_count
            ));
        }
        Ok(())
    }

    /// Note that the code used zero-based indexing.
    pub fn make_random_code(&self) -> Vec<usize> {
        let mut data: Vec<_> = (0..self.keyword_count).collect();
        data.shuffle(&mut rand::rng());
        data.truncate(self.clue_count);
        data
    }

    pub fn pick_random_keywords(&self) -> (Vec<String>, Vec<String>) {
        let mut keywords = self.keyword_list.load();
        assert!(keywords.len() >= self.keyword_count);

        keywords.shuffle(&mut rand::rng());
        keywords.truncate(self.keyword_count * 2);
        let other = keywords.split_off(self.keyword_count);
        (keywords, other)
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
    fixed: Option<Duration>,
    /// Timer that starts after the team is done.
    after_other: Option<Duration>,
    /// Timer that starts after the team marks frustration.
    after_frustrated: Duration,
}
impl Default for EncryptTimeLimit {
    fn default() -> Self {
        Self {
            fixed: None,
            after_other: None,
            after_frustrated: Duration::from_secs(60),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct GuessTimeLimit {
    /// Fixed upper limit.
    fixed: Option<Duration>,
    /// Timer that starts after the team marks frustration.
    after_frustrated: Duration,
}
impl Default for GuessTimeLimit {
    fn default() -> Self {
        Self {
            fixed: None,
            after_frustrated: Duration::from_secs(60),
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum KeywordList {
    /// Use the default decrypto word list.
    #[default]
    Default,
}

impl KeywordList {
    pub fn load(&self) -> Vec<String> {
        match self {
            KeywordList::Default => std::fs::read_to_string("wordlists/default.txt")
                .expect("Failed to read keywords file")
                .lines()
                .map(|line| line.trim().to_string())
                .collect(),
        }
    }
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
