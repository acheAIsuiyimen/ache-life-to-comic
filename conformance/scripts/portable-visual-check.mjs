import {createRequire} from "node:module";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const {chromium} = require("playwright");
const projectRoot = path.resolve(".");
const reviewRoot = path.join(projectRoot, "conformance/review/portable-share");
const fixture = JSON.parse(await readFile(
  path.join(reviewRoot, "fixture-report.json"),
  "utf8"
));
const screenshots = path.join(reviewRoot, "screenshots");
await mkdir(screenshots, {recursive: true});

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
const results = [];
for (const output of fixture.outputs) {
  for (const viewport of [
    {name: "desktop", width: 1440, height: 1000},
    {name: "mobile", width: 390, height: 844}
  ]) {
    const page = await browser.newPage({
      viewport: {width: viewport.width, height: viewport.height}
    });
    const consoleErrors = [];
    const remoteRequests = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    page.on("request", (request) => {
      if (/^https?:/iu.test(request.url())) remoteRequests.push(request.url());
    });
    await page.goto(`file://${output.path}`, {waitUntil: "load"});
    await page.screenshot({
      path: path.join(screenshots, `${output.name}-${viewport.name}.png`),
      fullPage: true
    });
    const metrics = await page.evaluate(async (mode) => {
      await document.fonts.ready;
      const images = [...document.querySelectorAll("img[data-required-image]")];
      return {
        horizontalOverflow:
          document.documentElement.scrollWidth > document.documentElement.clientWidth,
        missingImages: images.filter((image) => !image.complete || image.naturalWidth === 0).length,
        requiredImageCount: images.length,
        pageCount: document.querySelectorAll(".ache-page").length,
        portableMeta:
          document.querySelector('meta[name="ache-portable-share"]')?.content ?? null,
        fontMode:
          document.querySelector('meta[name="ache-portable-font-mode"]')?.content ?? null,
        faithfulFontLoaded: mode === "faithful"
          ? document.fonts.check('16px "Ache WenKai"')
          : null
      };
    }, output.choice);
    const pass =
      !metrics.horizontalOverflow
      && metrics.missingImages === 0
      && metrics.requiredImageCount > 0
      && metrics.pageCount > 0
      && metrics.portableMeta === "ache-portable-share/1.0.0"
      && metrics.fontMode === output.choice
      && (output.choice !== "faithful" || metrics.faithfulFontLoaded)
      && consoleErrors.length === 0
      && remoteRequests.length === 0;
    results.push({
      output: output.name,
      viewport: viewport.name,
      ...metrics,
      consoleErrors,
      remoteRequests,
      pass
    });
    await page.close();
  }
}
await browser.close();

const report = {
  status: results.every((result) => result.pass) ? "PASS" : "FAIL",
  isolatedDirectory: fixture.outputs[0] ? path.dirname(fixture.outputs[0].path) : null,
  assetsCopiedBesideHtml: fixture.assetsCopiedBesideHtml,
  results
};
await writeFile(
  path.join(reviewRoot, "portable-check-report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8"
);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.status !== "PASS") process.exitCode = 1;
