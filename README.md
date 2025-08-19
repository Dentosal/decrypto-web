# Decrypto web ui, but slightly improved

Original rules can be found here: https://cdn.1j1ju.com/medias/fb/0d/f3-decrypto-rulebook.pdf

## TODO

* Support draring: https://brush.ninja/create/drawing/
* Support webauthn between devices to move sessions?
* Tests

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
