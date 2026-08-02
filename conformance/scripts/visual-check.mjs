import {createRequire} from "node:module";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const {chromium} = require("playwright");

const projectRoot = path.resolve(".");
const reviewRoot = path.join(projectRoot, "conformance/review/visual-fixture");
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
for (const viewport of [
  {name: "desktop", width: 1440, height: 1100},
  {name: "mobile", width: 390, height: 844}
]) {
  const page = await browser.newPage({
    viewport: {width: viewport.width, height: viewport.height},
    deviceScaleFactor: 1
  });
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.goto(`file://${fixture.monthlyIndex}`, {waitUntil: "load"});
  await page.screenshot({
    path: path.join(screenshots, `${viewport.name}.png`),
    fullPage: true
  });
  const metrics = await page.evaluate(() => {
    const images = [...document.querySelectorAll("img[data-required-image]")];
    const elements = [...document.querySelectorAll("h1,h2,p,img")];
    const intersects = (left, right) => !(
      left.right <= right.left + 0.5
      || right.right <= left.left + 0.5
      || left.bottom <= right.top + 0.5
      || right.bottom <= left.top + 0.5
    );
    const pageMetrics = [...document.querySelectorAll(".ache-page")].map((artboard, pageIndex) => {
      const header = artboard.querySelector(".ache-page-head")?.getBoundingClientRect();
      const content = artboard.querySelector("main[data-layout-zone],.ache-cover-content")?.getBoundingClientRect();
      const footer = artboard.querySelector(".ache-footer")?.getBoundingClientRect();
      const textSizes = [...artboard.querySelectorAll(".ache-text-column")]
        .map((element) => Number.parseFloat(getComputedStyle(element).fontSize));
      const artboardRect = artboard.getBoundingClientRect();
      const imageBounds = [...artboard.querySelectorAll("img[data-required-image]")]
        .map((element) => element.getBoundingClientRect());
      return {
        pageIndex: pageIndex + 1,
        classes: artboard.className,
        client: {width: artboard.clientWidth, height: artboard.clientHeight},
        scroll: {width: artboard.scrollWidth, height: artboard.scrollHeight},
        hiddenOverflow:
          artboard.scrollHeight > artboard.clientHeight + 1
          || artboard.scrollWidth > artboard.clientWidth + 1,
        zoneCollision:
          Boolean(header && content && intersects(header, content))
          || Boolean(content && footer && intersects(content, footer))
          || Boolean(header && footer && intersects(header, footer)),
        imageOutOfPage: imageBounds.some((rect) =>
          rect.left < artboardRect.left - 0.5
          || rect.right > artboardRect.right + 0.5
          || rect.top < artboardRect.top - 0.5
          || rect.bottom > artboardRect.bottom + 0.5
        ),
        cropWithoutOptIn: [...artboard.querySelectorAll("img[data-required-image]")]
          .some((element) =>
            element.dataset.imageFit !== "cover"
            && getComputedStyle(element).objectFit !== "contain"
          ),
        minBodyFont: textSizes.length > 0 ? Math.min(...textSizes) : null
      };
    });
    const outOfCanvas = elements.filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left < -0.5 || rect.right > window.innerWidth + 0.5;
    }).length;
    return {
      horizontalOverflow:
        document.documentElement.scrollWidth > document.documentElement.clientWidth,
      missingImages: images.filter((image) => !image.complete || image.naturalWidth === 0).length,
      requiredImageCount: images.length,
      outOfCanvas,
      pageCount: document.querySelectorAll(".ache-page").length,
      articleCount: document.querySelectorAll("article.ache-episode").length,
      pendingCount: document.querySelectorAll(".ache-pending").length,
      hiddenOverflowCount: pageMetrics.filter((item) => item.hiddenOverflow).length,
      zoneCollisionCount: pageMetrics.filter((item) => item.zoneCollision).length,
      imageOutOfPageCount: pageMetrics.filter((item) => item.imageOutOfPage).length,
      cropWithoutOptInCount: pageMetrics.filter((item) => item.cropWithoutOptIn).length,
      minimumBodyFont: Math.min(
        ...pageMetrics.map((item) => item.minBodyFont).filter(Number.isFinite),
        Number.POSITIVE_INFINITY
      ),
      failingPages: pageMetrics.filter((item) =>
        item.hiddenOverflow || item.zoneCollision || item.imageOutOfPage || item.cropWithoutOptIn
      ),
      designSystem:
        document.querySelector('meta[name="ache-design-system"]')?.content ?? null
    };
  });
  results.push({
    viewport: viewport.name,
    ...metrics,
    consoleErrors,
    pass:
      !metrics.horizontalOverflow
      && metrics.missingImages === 0
      && metrics.requiredImageCount === 4
      && metrics.outOfCanvas === 0
      && metrics.pageCount >= 6
      && metrics.articleCount === 3
      && metrics.pendingCount === 1
      && metrics.hiddenOverflowCount === 0
      && metrics.zoneCollisionCount === 0
      && metrics.imageOutOfPageCount === 0
      && metrics.cropWithoutOptInCount === 0
      && (viewport.name !== "mobile" || metrics.minimumBodyFont >= 12)
      && metrics.designSystem === "ache-design-system/1.2.0"
      && consoleErrors.length === 0
  });
  await page.close();
}
await browser.close();

const report = {
  status: results.every((result) => result.pass) ? "PASS" : "FAIL",
  results,
  externalWritesPerformed: false
};
await writeFile(
  path.join(reviewRoot, "visual-check-report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8"
);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.status !== "PASS") process.exitCode = 1;
