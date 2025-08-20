# Decrypto web ui, but slightly improved

Original rules can be found here: https://cdn.1j1ju.com/medias/fb/0d/f3-decrypto-rulebook.pdf

## TODO

* Mini chat below intercept matrix to for guessing
* Show own team interception matrix optionally
* Settings editor
* Cusotm wordlists
* Support drawing: https://brush.ninja/create/drawing/
* Support webauthn between devices to move sessions?
* Persist user sessions across server restarts
* More e2e tests
* More validation rules
* LLM player support
* LLM-based tiebreaker judge

## Dev

### Running e2e tests

This assumes macOS. Requires Firefox to be installed. Should be quite easy to adapt for others though.

Install deps with

```bash
brew install geckodriver
python3 -m pip install pytest requests selenium portpicker
```

and the run

```bash
python3 -m pytest
```
