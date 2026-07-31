import {copyFile, mkdir} from "node:fs/promises";
import {createRequire} from "node:module";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

const require = createRequire(import.meta.url);
const {chromium} = require(
  process.env.NODE_PATH
    ? path.join(process.env.NODE_PATH, "playwright")
    : "playwright"
);

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "../..");
const htmlPath = path.join(projectRoot, "conformance/review/style-selector.html");
const renderedPath = path.join(
  projectRoot,
  "conformance/review/style-selector.png"
);
const packagedPath = path.join(
  projectRoot,
  "dist/codex/ache-life-to-comic/assets/presets/style-selector.png"
);

await mkdir(path.dirname(renderedPath), {recursive: true});
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
try {
  const page = await browser.newPage({
    viewport: {width: 2000, height: 1500},
    deviceScaleFactor: 1
  });
  await page.goto(pathToFileURL(htmlPath).href, {waitUntil: "load"});
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({path: renderedPath, fullPage: false});
  await copyFile(renderedPath, packagedPath);
} finally {
  await browser.close();
}
