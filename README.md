# Tap the Dino

Standalone browser game at **https://tapthedino.com/**, hosted on GitHub Pages.
Space, up arrow, or tap to jump. Keep jumping: the world has other plans.

## Development

No build step or runtime dependencies. Serve this directory with a static server:

```sh
python3 -m http.server 8000
```

Open http://localhost:8000/. Do not open index.html as a file: artwork uses fetch.

## Deployment

GitHub Pages publishes the root of `main` after a push. Keep `CNAME` set to
`tapthedino.com` and `.nojekyll` present. DNS is managed in Porkbun.
Never add API keys or `.env` files to this public repository.

## Source and maintenance

Extracted from `lilou-hue/SlayPlay`, commit
`016a817fde086307653806fbb1f5123617100184`, directory `arcade/no-internet/`.
This is now a standalone game: it no longer loads SlayPlay's shared `arcade.js`
or `arcade.css`, and has no SlayPlay navigation, back link, popups, coins, quests,
badges, achievements, store or challenge banner. Its own small end card shows the
score and best, with Play again and Share (`https://tapthedino.com/`). Scores and
mute use the original browser-local keys (`a1NoInternetBest`,
`a1NoInternetMuted`) on this origin. Keyboard `M` toggles sound; the controls
appear once the world is revealed (or when focused with Tab).

Changes to SlayPlay do **not** deploy here automatically. The later scenes keep the
internal SlayPlay gameplay; port changes by hand and keep the standalone paths/URLs.

## First phase and reveal

Before play, and through the first offline phase of lap one, the page is the
Chromium offline error page and its own runner (`opening.js`): idle blinks, the
first jump, the 0.4 s widening intro, the obstacle-free start, cacti, distance
meter, clouds, night mode in dark theme, sounds, and GAME OVER with in-place retry
(Space/Up after 1.2 s, Enter, or tapping the runner). It is a small local
reimplementation stepped at a fixed 60 Hz from `game.js`, drawn with Chromium's
1x/2x sprites at the runner canvas's own integer pixel ratio. Like Chrome, it cannot
start before its sprite sheet has loaded: until then the static idle crop is shown
and input is ignored; a failed sheet is retried, then the other density is used. Ducking and
pterodactyls are not implemented (pterodactyls cannot appear at these speeds).

Game rules for this phase: three cacti cleared (credited on landing) start the
transformation; the 12.5 s collision-free deadline is unchanged. A collision ends
only that attempt: no heart is lost, time stops, nothing is written, and retry
discards the attempt's clears and their score. Hearts are full at the reveal. The
distance meter and its HI value are visual only and kept in memory.

At the third clear the same hero and runway are handed to the main renderer at
identical screen geometry (`flatAnchor`): the line tears out past the runner box,
ripples, the page text and runner remnants dissolve, and the extrusion folds the
page into the 3D world. Until the morph begins, jumps keep the page runner's physics
and sound. The HUD, hearts, chapter and controls appear only once the
camera is underway. Restart returns to the idle page. Later laps are unchanged.

`?debug` exposes `DINO_DEBUG.advance(seconds)` and `DINO_DEBUG.freeze(true)` (stepped
captures); `?debug&seed=N` makes the runner's randomness reproducible. Using any of
these marks the run (and later runs in that page) debug-assisted: no score writes,
no banking, no end card. `DINO_DEBUG.state.opening` and
`.handoff` report runner, geometry and hero metrics.

Differences from Chrome: the runner is resized immediately on window resize instead
of Chrome's pause; the fixed 60 Hz step differs from Chrome's variable frame time
by about a frame (apex and intro offset can differ by a few pixels); the HI score
is not persisted. Browser versions, fonts and locale may differ; the reference is
the English offline page in Chrome 157 on Linux.

The Chrome-derived artwork, sounds and layout attribution is in
`THIRD_PARTY_NOTICES.md`.
