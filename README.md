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
`016a817fde086307653806fbb1f5123617100184`, directory `arcade/no-internet/`,
plus shared `arcade.js` and `arcade.css`. Gameplay and artwork are unchanged.
Standalone changes: root-relative asset layout, title/metadata/favicon, canonical
URL, share/challenge URLs, and explicit links back to SlayPlay. The shared
arcade URL-activated debug/admin shortcut is removed.

This is an independent copy: changes to SlayPlay do **not** deploy here automatically.
To bring in game updates, copy the game JS/CSS/assets, review any HTML changes,
and preserve the standalone paths and URLs. Shared arcade code keeps the original
`no-internet` internal game ID. Scores/settings are browser-local and separate
from slayplay.io because this site has its own origin.
