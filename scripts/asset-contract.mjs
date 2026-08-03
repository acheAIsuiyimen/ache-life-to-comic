import {readFile} from "node:fs/promises";

export const ASSET_CONTRACT_VERSION = "ache-visual-asset/1.0.0";

const COVER_ROLES = new Set(["cover-visual", "monthly-cover"]);
const ORIGINAL_ROLES = new Set(["body-photo"]);

function pngSize(buffer) {
  if (buffer.length < 24 || buffer.toString("hex", 0, 8) !== "89504e470d0a1a0a") return null;
  return {width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20)};
}

function jpegSize(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return {height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7)};
    }
    if (!length || length < 2) break;
    offset += 2 + length;
  }
  return null;
}

export async function readImageSize(file) {
  const buffer = await readFile(file);
  return pngSize(buffer) ?? jpegSize(buffer) ?? null;
}

export function aspectClass(width, height) {
  if (!width || !height) return "unknown";
  const ratio = width / height;
  if (ratio < 0.72) return "portrait";
  if (ratio < 0.9) return "portrait-soft";
  if (ratio <= 1.12) return "square";
  if (ratio <= 1.62) return "landscape";
  return "landscape-wide";
}

export function normalizeAsset(asset, intrinsic = null, defaults = {}) {
  const role = asset.role ?? defaults.role ?? "body-visual";
  const width = Number(asset.intrinsicWidth ?? intrinsic?.width ?? 0) || null;
  const height = Number(asset.intrinsicHeight ?? intrinsic?.height ?? 0) || null;
  const independent = asset.independent ?? COVER_ROLES.has(role);
  const cropAllowed = ORIGINAL_ROLES.has(role) ? false : asset.allowCrop === true;
  return {
    ...asset,
    schemaVersion: ASSET_CONTRACT_VERSION,
    role,
    assetId: asset.assetId ?? defaults.assetId ?? null,
    sourceGroupId: asset.sourceGroupId ?? null,
    generationMode: asset.generationMode ?? (independent ? "independent" : "unknown"),
    independent,
    intrinsicWidth: width,
    intrinsicHeight: height,
    aspectClass: asset.aspectClass ?? aspectClass(width, height),
    fitPolicy: cropAllowed ? "cover-allowed" : "contain-complete",
    allowCrop: cropAllowed
  };
}

export function validateAssetContract(asset) {
  const failures = [];
  if (!asset?.role) failures.push("asset-role-missing");
  if (COVER_ROLES.has(asset?.role)) {
    if (asset.independent !== true) failures.push("cover-not-independent");
    if (asset.allowCrop === true) failures.push("cover-crop-forbidden");
    if (asset.intrinsicWidth && asset.intrinsicHeight) {
      const ratio = asset.intrinsicWidth / asset.intrinsicHeight;
      if (Math.abs(ratio - 0.75) > 0.035) failures.push("cover-not-3x4");
    }
  }
  if (ORIGINAL_ROLES.has(asset?.role) && asset.allowCrop === true) {
    failures.push("original-photo-crop-forbidden");
  }
  if (asset?.generationMode === "sheet-crop") {
    if (asset.sheetLayout !== "isolated-cells") failures.push("sheet-crop-not-isolated");
    if (!asset.cellBounds || !asset.safeGutter) failures.push("sheet-cell-contract-missing");
  }
  if (asset?.generationMode === "fraction-crop") failures.push("arbitrary-fraction-crop-forbidden");
  return failures;
}

export function assertAssetContract(asset) {
  const failures = validateAssetContract(asset);
  if (failures.length > 0) throw new Error(`Invalid visual asset: ${failures.join(",")}`);
  return asset;
}
