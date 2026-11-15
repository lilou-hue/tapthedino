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
