import {createRequire} from "node:module";
import {mkdir, writeFile} from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const {chromium} = require("playwright");
const root = path.resolve(".");
const review = path.join(root, "review/index.html");
const output = path.join(root, "review/rendered");
await mkdir(output, {recursive: true});

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
const results = [];
for (const viewport of [
  {name: "desktop", width: 1440, height: 1000},
  {name: "mobile", width: 390, height: 844}
]) {
  const page = await browser.newPage({viewport});
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.goto(`file://${review}`, {waitUntil: "load"});
  await page.screenshot({
    path: path.join(output, `${viewport.name}.png`),
    fullPage: true
  });
  const metrics = await page.evaluate(() => ({
    horizontalOverflow:
      document.documentElement.scrollWidth > document.documentElement.clientWidth,
    missingImages: [...document.images]
      .filter((image) => !image.complete || image.naturalWidth === 0).length,
    imageCount: document.images.length,
    emptyLinks: [...document.links].filter((link) => !link.getAttribute("href")).length,
    outOfCanvas: [...document.querySelectorAll("h1,h2,h3,p,img,a")].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left < -0.5 || rect.right > window.innerWidth + 0.5;
    }).length
  }));
  results.push({
    viewport: viewport.name,
    ...metrics,
    consoleErrors,
    pass:
      !metrics.horizontalOverflow
      && metrics.missingImages === 0
      && metrics.imageCount === 4
      && metrics.emptyLinks === 0
      && metrics.outOfCanvas === 0
      && consoleErrors.length === 0
  });
  await page.close();
}
await browser.close();
const report = {
  status: results.every((item) => item.pass) ? "PASS" : "FAIL",
  results
};
await writeFile(
  path.join(root, "review/render-report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8"
);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.status !== "PASS") process.exitCode = 1;
