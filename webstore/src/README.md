# Store asset sources

Everything in `webstore/` (icons, screenshots, promo tiles) is generated from these sources,
so the assets can be refreshed whenever the UI changes. All scripts drive the locally
installed Google Chrome in headless mode over the DevTools protocol; they need Node 22+
and no npm packages.

| Path | What it is |
| --- | --- |
| `icon.mjs` | Icon design (SVG generator) and per-size presets |
| `icons/` | Generated SVGs for every size |
| `frame.html` | Marketing frame for screenshots and promo tiles |
| `wallpapers/` | Demo wallpapers used in the screenshots |
| `tools/mock.js` | `chrome.*` API mock with demo bookmarks |
| `tools/*.mjs` | Render scripts (see below) |

## Icons

```bash
node webstore/src/tools/icons.mjs            # writes webstore/src/icons/*.svg|png
cp webstore/src/icons/icon-{16,24,32,48,64,128}.png src/assets/icons/
cp webstore/src/icons/icon-128.png "webstore/Store icon.png"
```

Toolbar sizes (16, 24) use a 2x2 grid so they stay crisp; 128 keeps the 16px
transparent padding the Chrome Web Store asks for.

## Screenshots and promo tiles

```bash
npx ng build --configuration development
cp webstore/src/wallpapers/*.jpg dist/GridBookmarkTab/
(cd dist/GridBookmarkTab && python3 -m http.server 8765) &

node webstore/src/tools/scenes.mjs /tmp/gbk-raw     # raw 2560x1600 captures of the real UI
# zoomed callouts used by compose.mjs
magick /tmp/gbk-raw/dock.png -crop 1160x225+700+1378 +repage /tmp/gbk-raw/dock-inset.png
magick /tmp/gbk-raw/organize.png -crop 1300x150+630+1280 +repage /tmp/gbk-raw/org-inset.png
node webstore/src/tools/compose.mjs /tmp/gbk-raw    # writes webstore/screenshots and webstore/promo
```

The first `scenes.mjs` run fetches real favicons over the network (about 40s);
they are cached in `<raw dir>/_favicons.json` for later runs.
