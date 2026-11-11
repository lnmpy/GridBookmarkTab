import { launch, sleep } from './cdp.mjs';
const dir = process.argv[2] || new URL('../wallpapers', import.meta.url).pathname;
const b = await launch({ port: 9334 });
await b.send('Page.enable');
await b.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1200, deviceScaleFactor: 1, mobile: false });
for (const n of ['light', 'dark']) {
  await b.send('Page.navigate', { url: `file://${dir}/${n}.html` });
  await sleep(1500);
  await b.shot(`${dir}/${n}.png`);
}
b.close();
