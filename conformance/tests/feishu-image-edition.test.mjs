import test from "node:test";
import assert from "node:assert/strict";
import { buildFeishuImageEditionXml, validateFeishuImageEdition } from "../../scripts/feishu-image-edition.mjs";

function page(number) {
  const name = `${String(number).padStart(3, "0")}.png`;
  return { name, width: 1080, height: 1440, bytes: 900_000, digest: `digest-${number}`, token: `token-${number}` };
}

const sourceQa = { status: "PASS", desktop: true, mobile: true };
const expectedNames = ["001.png", "002.png", "003.png"];

test("Feishu image edition keeps validated pages in exact reading order", () => {
  const pages = [page(1), page(2), page(3)];
  const result = validateFeishuImageEdition({ pages, expectedNames, sourceQa });
  assert.equal(result.pass, true);
  const xml = buildFeishuImageEditionXml({ title: "七月册", subtitle: "连续画册 · 3页", pages, expectedNames, sourceQa });
  assert.match(xml, /<title>七月册<\/title>/);
  assert.deepEqual([...xml.matchAll(/name="(\d{3}\.png)"/g)].map((match) => match[1]), expectedNames);
  assert.doesNotMatch(xml, /<h1>|<blockquote>|caption=/);
});

test("Feishu XML builder refuses to infer canonical page order from its own input", () => {
  assert.throws(
    () => buildFeishuImageEditionXml({ title: "七月册", subtitle: "连续画册 · 3页", pages: [page(2), page(1), page(3)], sourceQa }),
    /expectedNames is required/
  );
  assert.throws(
    () => buildFeishuImageEditionXml({ title: "七月册", subtitle: "连续画册 · 3页", pages: [page(2), page(1), page(3)], expectedNames, sourceQa }),
    /page-order/
  );
});

test("Feishu image edition blocks missing, duplicate, shuffled, low-res and wrong-ratio pages", () => {
  const cases = [
    { pages: [page(1), page(2)], code: "page-count" },
    { pages: [page(1), { ...page(2), digest: "digest-1" }, page(3)], code: "duplicate-page" },
    { pages: [page(2), page(1), page(3)], code: "page-order" },
    { pages: [{ ...page(1), width: 135, height: 180 }, page(2), page(3)], code: "wrong-canvas" },
    { pages: [{ ...page(1), width: 1080, height: 1080 }, page(2), page(3)], code: "wrong-canvas" }
  ];
  for (const item of cases) {
    const result = validateFeishuImageEdition({ pages: item.pages, expectedNames, sourceQa });
    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => issue.code === item.code));
  }
});
