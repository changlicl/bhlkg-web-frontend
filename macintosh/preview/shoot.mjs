/* Dev-only verification script (safe to delete). Screenshots the blockout
   page in each camera preset, tests resize, and captures console errors. */
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = 'macintosh/preview';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });

const macErrors = [];
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') macErrors.push(m.text()); });
page.on('pageerror', (e) => macErrors.push(String(e)));
await page.setViewport({ width: 1440, height: 900 });
await page.goto('http://localhost:3000/macintosh/', { waitUntil: 'networkidle0', timeout: 20000 });
await wait(700);
await page.screenshot({ path: `${OUT}/4-three-quarter.png` });

for (const [key, name] of [['1', 'front'], ['2', 'side'], ['3', 'top']]) {
  await page.keyboard.press(key);
  await wait(250);
  await page.screenshot({ path: `${OUT}/${key}-${name}.png` });
}

await page.keyboard.press('4');
await page.setViewport({ width: 390, height: 844 });
await wait(400);
await page.screenshot({ path: `${OUT}/mobile-390.png` });

const homeErrors = [];
const home = await browser.newPage();
home.on('console', (m) => { if (m.type() === 'error') homeErrors.push(m.text()); });
home.on('pageerror', (e) => homeErrors.push(String(e)));
await home.setViewport({ width: 1440, height: 900 });
try {
  await home.goto('http://localhost:3000/', { waitUntil: 'networkidle2', timeout: 25000 });
  await wait(1500);
} catch (e) {
  homeErrors.push('goto: ' + String(e));
}
await home.screenshot({ path: `${OUT}/homepage.png` });

console.log(JSON.stringify({ macErrors, homeErrors }, null, 2));
await browser.close();
