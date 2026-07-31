import {createRequire} from "node:module";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const {chromium} = require("playwright");
const {createCanvas, GifEncoder, loadImage} = require("@napi-rs/canvas");

const root = path.resolve(".");
const source = path.join(root, "docs/assets/readme-hero-source.html");
const output = path.join(root, "docs/assets");
const frames = path.join(output, ".hero-frames");
await mkdir(frames, {recursive: true});

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
const page = await browser.newPage({
  viewport: {width: 1200, height: 630},
  deviceScaleFactor: 1
});
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));
await page.goto(`file://${source}`, {waitUntil: "load"});
await page.evaluate(() => document.fonts.ready);
await page.screenshot({path: path.join(output, "readme-hero.png")});

for (const [index, step] of ["0", "1", "2", "3", "3"].entries()) {
  await page.evaluate((value) => {
    document.body.dataset.step = value;
  }, step);
  await page.waitForTimeout(index === 0 ? 40 : 720);
  await page.screenshot({path: path.join(frames, `${index}.png`)});
}
await browser.close();

const width = 960;
const height = 504;
const canvas = createCanvas(width, height);
const context = canvas.getContext("2d");
const encoder = new GifEncoder(width, height, {repeat: 0, quality: 12});
for (let index = 0; index < 5; index += 1) {
  const image = await loadImage(await readFile(path.join(frames, `${index}.png`)));
  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  const frame = context.getImageData(0, 0, width, height);
  const rgba = new Uint8Array(
    frame.data.buffer,
    frame.data.byteOffset,
    frame.data.byteLength
  );
  encoder.addFrame(rgba, width, height, {
    delay: index === 4 ? 1600 : 700
  });
}
await writeFile(path.join(output, "readme-demo.gif"), encoder.finish());
encoder.dispose();

const report = {
  status: errors.length === 0 ? "PASS" : "FAIL",
  files: ["docs/assets/readme-hero.png", "docs/assets/readme-demo.gif"],
  consoleErrors: errors
};
await writeFile(
  path.join(output, "readme-assets-report.json"),
  `${JSON.stringify(report, null, 2)}\n`
);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.status !== "PASS") process.exitCode = 1;
