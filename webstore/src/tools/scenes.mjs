// Captures raw 1280x800@2x screenshots of the real new tab UI for each store scene.
import fs from 'node:fs';
import { launch, sleep } from './cdp.mjs';

const out = process.argv[2];
const only = process.argv[3];
fs.mkdirSync(out, { recursive: true });
const mock = fs.readFileSync(new URL('./mock.js', import.meta.url), 'utf8');
const BASE = 'http://localhost:8765';
const faviconCacheFile = `${out}/_favicons.json`;
let favicons = fs.existsSync(faviconCacheFile) ? JSON.parse(fs.readFileSync(faviconCacheFile, 'utf8')) : {};

const base = { bookmarkDisplayColumn: 8, dockFolderId: '20', dockIconSize: 50, bookmarkSize: 80, language: 'en' };
const light = { ...base, theme: 'light', wallpaperType: 'bing', wallpaperDim: 0 };
const dark = { ...base, theme: 'dark', wallpaperType: 'bing', wallpaperDim: 10 };
const darkStill = dark;

async function open(b, settings, wallpaper, lang) {
  const scene = { settings, local: favicons, lang, wallpaperUrl: wallpaper && `${BASE}/${wallpaper}.jpg` };
  if (open.scriptId) await b.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: open.scriptId });
  ({ identifier: open.scriptId } = await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__SCENE__=${JSON.stringify(scene)};` + mock }));
  await b.send('Page.navigate', { url: 'about:blank' });
  await sleep(300);
  await b.send('Page.navigate', { url: `${BASE}/index.html#/?target=new-tab` });
  // Favicons are fetched with throttling; give a cold cache much longer
  await sleep(Object.keys(favicons).length > 30 ? 6000 : 40000);
  const local = await b.evaluate('window.__mockLocal');
  favicons = Object.fromEntries(Object.entries(local).filter(([k]) => k.startsWith('favicon') || k.startsWith('customIcon')));
  fs.writeFileSync(faviconCacheFile, JSON.stringify(favicons));
}

const cmp = `ng.getComponent(document.querySelector('app-new-tab'))`;
const center = (sel, i = 0) => `(() => { const r = document.querySelectorAll(${JSON.stringify(sel)})[${i}].getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`;

const scenes = {
  async hero(b) {
    await open(b, light, 'light');
  },
  async search(b) {
    await open(b, light, 'light');
    await b.key(' ', 'Space', 32, ' ');
    await sleep(600);
    await b.type('goog');
    await sleep(900);
    await b.key('ArrowDown', 'ArrowDown', 40);
    await sleep(400);
  },
  async dock(b) {
    await open(b, dark, 'dark');
    const [x, y] = await b.evaluate(center('.dock-item-wrapper', 2));
    await b.mouse(x - 20, y + 4);
    await sleep(200);
    await b.mouse(x, y + 4);
    await sleep(900);
  },
  async organize(b) {
    await open(b, light, 'light');
    // Enter the "Work" folder and multi-select a few bookmarks
    const [x, y] = await b.evaluate(center('.bookmark-card, .folder-card, [id^=bookmark-]', 0));
    await b.mouse(x, y, true);
    await sleep(1500);
    await b.evaluate(`(() => { const c = ${cmp}; const ids = [...document.querySelectorAll('.bookmark-card')].slice(1, 5).map(e => e.id.replace('bookmark-', '')); c.selectedBookmarkIds.set(new Set(ids)); })()`);
    await sleep(800);
  },
  async darkgrid(b) {
    await open(b, dark, 'dark');
  },
  async settings(b) {
    await open(b, light, 'light');
    await b.evaluate(`void ${cmp}.openSettingsModal()`);
    await sleep(1500);
  },
  async i18n(b) {
    await open(b, { ...light, language: 'ja' }, 'light', 'ja');
    await b.key(' ', 'Space', 32, ' ');
    await sleep(600);
    await b.type('git');
    await sleep(900);
  },
};

const b = await launch({ flags: ['--disable-web-security'] });
await b.send('Page.enable');
await b.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 2, mobile: false });
try {
  for (const [name, run] of Object.entries(scenes)) {
    if (only && !only.split(',').includes(name)) continue;
    await run(b);
    await b.shot(`${out}/${name}.png`);
    console.log('captured', name);
  }
} finally {
  b.close();
}
