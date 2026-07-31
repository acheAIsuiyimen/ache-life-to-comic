import {createRequire} from "node:module";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const {chromium} = require("playwright");
const {createCanvas, GifEncoder, loadImage} = require("@napi-rs/canvas");

const root = path.resolve(".");
const source = path.join(root, "docs/assets/readme-hero-source.html");
const bookSource = path.join(root, "docs/assets/book-scene-source.html");
const showcaseSource = path.join(root, "docs/assets/showcase-source.html");
const effectSource = path.join(root, "docs/assets/effect-demo-source.html");
const output = path.join(root, "docs/assets");
const effectOutput = path.join(output, "effect-demo");
const frames = path.join(output, ".hero-frames");
await mkdir(frames, {recursive: true});
await mkdir(effectOutput, {recursive: true});

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
const page = await browser.newPage({
  viewport: {width: 1200, height: 630},
  deviceScaleFactor: 2
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

const bookPage = await browser.newPage({
  viewport: {width: 1800, height: 1125},
  deviceScaleFactor: 2
});
bookPage.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
bookPage.on("pageerror", (error) => errors.push(error.message));
await bookPage.goto(`file://${bookSource}`, {waitUntil: "load"});
await bookPage.evaluate(() => document.fonts.ready);
await bookPage.screenshot({path: path.join(output, "readme-book-scene.png")});
const bookAudit = await bookPage.evaluate(() => {
  const images = [...document.querySelectorAll(".paper img, .mini")];
  const items = images.map((image) => {
    const rect = image.getBoundingClientRect();
    return {
      alt: image.alt,
      loaded: image.complete && image.naturalWidth > 0,
      objectFit: getComputedStyle(image).objectFit,
      insideViewport:
        rect.left >= 0
        && rect.top >= 0
        && rect.right <= innerWidth
        && rect.bottom <= innerHeight
    };
  });
  const safeFrame = [...document.querySelectorAll(".book, .shelf, .workflow, .step")]
    .every((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left >= 36
        && rect.top >= 36
        && rect.right <= innerWidth - 36
        && rect.bottom <= innerHeight - 36;
    });
  return {
    pass:
      safeFrame
      &&
      items.every((item) =>
        item.loaded
        && item.objectFit === "contain"
        && item.insideViewport
      ),
    items,
    safeFrame
  };
});
if (!bookAudit.pass) errors.push("Book scene contains a cropped or missing page");

const showcasePage = await browser.newPage({
  viewport: {width: 1800, height: 1000},
  deviceScaleFactor: 2
});
showcasePage.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
showcasePage.on("pageerror", (error) => errors.push(error.message));
await showcasePage.goto(`file://${showcaseSource}`, {waitUntil: "load"});
await showcasePage.evaluate(() => document.fonts.ready);
await showcasePage.screenshot({path: path.join(output, "readme-showcase.png")});
const showcaseAudit = await showcasePage.evaluate(() => {
  const pages = [...document.querySelectorAll(".page")];
  const items = pages.map((page) => {
    const image = page.querySelector("img");
    const rect = page.getBoundingClientRect();
    const visibleWidth = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0));
    const visibleHeight = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
    const visibleAreaRatio = (visibleWidth * visibleHeight) / (rect.width * rect.height);
    return {
      alt: image?.alt ?? "",
      loaded: Boolean(image?.complete && image?.naturalWidth > 0),
      objectFit: image ? getComputedStyle(image).objectFit : null,
      visibleAreaRatio: Number(visibleAreaRatio.toFixed(3))
    };
  });
  return {
    pass: items.every((item) =>
        item.loaded
        && item.objectFit === "contain"
        && item.visibleAreaRatio >= 0.45
      ),
    items
  };
});
if (!showcaseAudit.pass) {
  errors.push("Showcase contains a missing image or an unreadably cropped page");
}

const effectPage = await browser.newPage({
  viewport: {width: 1800, height: 960},
  deviceScaleFactor: 2
});
effectPage.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
effectPage.on("pageerror", (error) => errors.push(error.message));
await effectPage.goto(`file://${effectSource}`, {waitUntil: "load"});
const effectAudits = {};
for (const demo of [
  "all-routes",
  "s-daily",
  "p-photo",
  "k-knowledge",
  "m-meeting",
  "l-longform"
]) {
  await effectPage.evaluate((value) => {
    document.body.dataset.demo = value;
  }, demo);
  await effectPage.evaluate(() => document.fonts.ready);
  await effectPage.screenshot({path: path.join(effectOutput, `${demo}.png`)});
  const audit = await effectPage.evaluate((value) => {
    const pages = [...document.querySelectorAll(`.${value} .page`)];
    const items = pages.map((pageElement) => {
      const image = pageElement.querySelector("img");
      const rect = pageElement.getBoundingClientRect();
      return {
        alt: image?.alt ?? "",
        loaded: Boolean(image?.complete && image?.naturalWidth > 0),
        objectFit: image ? getComputedStyle(image).objectFit : null,
        insideViewport:
          rect.left >= 30
          && rect.top >= 30
          && rect.right <= innerWidth - 30
          && rect.bottom <= innerHeight - 30
      };
    });
    return {
      pass: items.length > 0 && items.every((item) =>
        item.loaded
        && item.objectFit === "contain"
        && item.insideViewport
      ),
      items
    };
  }, demo);
  effectAudits[demo] = audit;
  if (!audit.pass) errors.push(`Effect demo failed safe-frame audit: ${demo}`);
}
await browser.close();

const width = 1200;
const height = 630;
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
  files: [
    "docs/assets/readme-hero.png",
    "docs/assets/readme-demo.gif",
    "docs/assets/readme-book-scene.png",
    "docs/assets/readme-showcase.png",
    "docs/assets/effect-demo/all-routes.png",
    "docs/assets/effect-demo/s-daily.png",
    "docs/assets/effect-demo/p-photo.png",
    "docs/assets/effect-demo/k-knowledge.png",
    "docs/assets/effect-demo/m-meeting.png",
    "docs/assets/effect-demo/l-longform.png"
  ],
  audits: {
    bookScene: bookAudit,
    showcase: showcaseAudit,
    effects: effectAudits
  },
  consoleErrors: errors
};
await writeFile(
  path.join(output, "readme-assets-report.json"),
  `${JSON.stringify(report, null, 2)}\n`
);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.status !== "PASS") process.exitCode = 1;
