use core::fmt;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Code(pub Vec<usize>);

impl Code {
    pub fn len(&self) -> usize {
        self.0.len()
    }
}

impl fmt::Display for Code {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{}",
            self.0
                .iter()
                .map(|n| (n + 1).to_string())
                .collect::<Vec<_>>()
                .join("-")
        )
    }
}
