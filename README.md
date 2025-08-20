# Decrypto web ui, but slightly improved

Original rules can be found here: http://www.scorpionmasque.com/sites/scorpionmasque.com/files/decrypto_en_rules_20sep2019.pdf
Game rules explained: https://www.youtube.com/watch?v=2DBg7Z2-pQ4&t=114s

## TODO

* Mini chat below intercept matrix to for guessing
* Show own team interception matrix optionally
* Settings editor
* Custom wordlists
* Support drawing: https://brush.ninja/create/drawing/
* Support webauthn between devices to move sessions?
* Persist user sessions across server restarts
* More e2e tests
* More validation rules
* LLM player support?
* LLM-based tiebreaker judge??

## Dev

### Setup

This assumes macOS. Requires Firefox to be installed. Should be quite easy to adapt for others though.

```bash
brew install geckodriver deno
python3 -m pip install 
cargo install cargo-make
carog make install-git-hooks
```

### Commands

```bash
cargo make fmt
cargo make check
cargo make test
```

### Running multiple browser windows with separate localStorage instances

```bash
/Applications/Firefox\ Nightly.app/Contents/MacOS/firefox --profile $(mktemp -d) --private-window
```
