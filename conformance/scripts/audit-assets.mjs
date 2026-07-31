import {createHash} from "node:crypto";
import {readFile, stat, writeFile} from "node:fs/promises";
import path from "node:path";

const projectRoot = path.resolve(".");
const skillRoot = path.join(projectRoot, ".");
const assets = [
  {
    file: "assets/presets/02-snow-pastel/golden/cover-environment-transformation.png",
    role: "visual-regression-reference",
    exactPageRequired: false
  },
  {
    file: "assets/presets/02-snow-pastel/golden/cover-typography-in-scene.png",
    role: "visual-regression-reference",
    exactPageRequired: false
  },
  {
    file: "assets/presets/02-snow-pastel/golden/photo-page.png",
    role: "validated-final-page",
    exactPageRequired: true
  },
  {
    file: "assets/presets/02-snow-pastel/golden/knowledge-contact-sheet.png",
    role: "review-contact-sheet",
    exactPageRequired: false
  },
  {
    file: "assets/presets/02-snow-pastel/golden/route-overview.png",
    role: "review-contact-sheet",
    exactPageRequired: false
  },
  {
    file: "assets/characters/66-dawang/anchor.png",
    role: "character-anchor",
    exactPageRequired: false
  }
];

function pngDimensions(buffer) {
  if (
    buffer.length < 24
    || buffer.toString("ascii", 1, 4) !== "PNG"
  ) {
    throw new Error("Only PNG assets are supported by this audit");
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

const results = [];
for (const item of assets) {
  const absolute = path.join(skillRoot, item.file);
  const buffer = await readFile(absolute);
  const dimensions = pngDimensions(buffer);
  results.push({
    ...item,
    bytes: (await stat(absolute)).size,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    ...dimensions,
    pass:
      !item.exactPageRequired
      || (dimensions.width === 1080 && dimensions.height === 1440)
  });
}
const report = {
  status: results.every((item) => item.pass) ? "PASS" : "FAIL",
  results
};
await writeFile(
  path.join(projectRoot, "conformance/review/asset-audit.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8"
);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.status !== "PASS") process.exitCode = 1;
