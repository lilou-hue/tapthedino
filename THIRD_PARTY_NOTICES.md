# Third-party notices

The opening-screen layout in `styles.css` is adapted from Chromium's
`components/neterror/resources/neterror.css`,
`components/security_interstitials/core/common/resources/interstitial_common.css`
and `interstitial_core.css`.

`assets/chrome-idle.png` and `assets/chrome-idle@2x.png` are crops of Chromium's
idle dinosaur canvas (including the short horizon), rendered from its bundled
offline sprites by Google Chrome 157.0.8103.78.

`assets/chrome-sprites.png` and `assets/chrome-sprites@2x.png` (offline runner
sprite sheets) and `assets/chrome-press.mp3`, `assets/chrome-hit.mp3`,
`assets/chrome-reached.mp3` (runner sounds) are unmodified copies of the resources
embedded in the offline error page of Google Chrome 157.0.8103.78 (Linux).
`opening.js` reimplements the behaviour of Chromium's offline runner
(`components/neterror/resources/dino_game/`) using its constants, sprite
coordinates and collision boxes.

None of these are screenshots of browser chrome, address bars or security
indicators.

Copyright The Chromium Authors. Distributed under Chromium's BSD-style license,
reproduced in [CHROMIUM-LICENSE.txt](CHROMIUM-LICENSE.txt).
Source: https://chromium.googlesource.com/chromium/src/

Tap the Dino is an independent game, not a Google product. The opening is a
visual homage to the offline dinosaur game; the later transformations are the
original game. No login forms or browser/security controls are imitated.


## EXTREME speech and original audio

`assets/audio/extreme/click-it.wav`, `click-harder.wav` and `provenance.json`
are exact copies from `lilou-hue/SlayPlay`, `arcade/no-internet/`, source commit
`a72728b` (EXTREME introduced in `8e1e9be`). The clips contain original synthetic
arcade-announcer dialogue, not recordings, imitations or clones of a named
performer or game announcer. The procedural music, ordinary jump beeps and comic
EXTREME effects are original game audio, separate from the Chromium samples.

The speech was generated offline using Piper's `en_US-ljspeech-medium` model,
trained from scratch on the **LJ Speech** public-domain recordings and
transcripts. Piper and the model are not shipped or run by this website. The
source provenance describes the phrase text, duration, WAV format and original
filtering/pitch/echo processing:
[assets/audio/extreme/provenance.json](assets/audio/extreme/provenance.json).

- Model card: https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/ljspeech/medium/MODEL_CARD
- Dataset: https://keithito.com/LJ-Speech-Dataset/
