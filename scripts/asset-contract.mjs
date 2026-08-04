import {readFile} from "node:fs/promises";
import path from "node:path";
import {inflateSync} from "node:zlib";

export const ASSET_CONTRACT_VERSION = "ache-visual-asset/1.2.0";

const COVER_ROLES = new Set(["cover-visual", "monthly-cover"]);
const ORIGINAL_ROLES = new Set(["body-photo"]);
const COMPONENT_ROLES = new Set(["explanatory-vignette", "decorative-component"]);
const TRANSPARENT_COMPONENT_MODES = new Set(["transparent-raster", "svg-vector"]);
const EDGE_TREATMENTS = new Set([
  "flush",
  "paper-mat",
  "torn-paper-frame",
  "organic-window",
  "die-cut-transparent"
]);

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

function svgSize(buffer) {
  const text = buffer.toString("utf8", 0, Math.min(buffer.length, 16_384));
  if (!/<svg\b/iu.test(text)) return null;
  const width = Number(text.match(/\bwidth=["']([0-9.]+)(?:px)?["']/iu)?.[1] ?? 0);
  const height = Number(text.match(/\bheight=["']([0-9.]+)(?:px)?["']/iu)?.[1] ?? 0);
  if (width && height) return {width, height};
  const viewBox = text.match(/\bviewBox=["']\s*[-0-9.]+\s+[-0-9.]+\s+([0-9.]+)\s+([0-9.]+)\s*["']/iu);
  return viewBox ? {width: Number(viewBox[1]), height: Number(viewBox[2])} : null;
}

function opaquePaint(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return Boolean(normalized) && !["none", "transparent"].includes(normalized);
}

function svgInspection(buffer) {
  const text = buffer.toString("utf8");
  if (!/<svg\b/iu.test(text)) return null;
  const size = svgSize(buffer);
  const root = text.match(/<svg\b[^>]*>/iu)?.[0] ?? "";
  const rootBackground = root.match(/(?:background|background-color)\s*:\s*([^;"']+)/iu)?.[1];
  let opaqueCanvas = opaquePaint(rootBackground);
  const canvasWidth = Number(size?.width ?? 0);
  const canvasHeight = Number(size?.height ?? 0);
  const coversCanvas = (tag) => {
    const x = Number(tag.match(/\bx=["']([0-9.]+)["']/iu)?.[1] ?? 0);
    const y = Number(tag.match(/\by=["']([0-9.]+)["']/iu)?.[1] ?? 0);
    const widthValue = tag.match(/\bwidth=["']([^"']+)["']/iu)?.[1] ?? "";
    const heightValue = tag.match(/\bheight=["']([^"']+)["']/iu)?.[1] ?? "";
    const width = widthValue === "100%" ? canvasWidth : Number(widthValue.replace(/px$/iu, ""));
    const height = heightValue === "100%" ? canvasHeight : Number(heightValue.replace(/px$/iu, ""));
    return x <= 0 && y <= 0 && width >= canvasWidth && height >= canvasHeight;
  };
  for (const tag of text.match(/<(?:rect|image)\b[^>]*>/giu) ?? []) {
    if (!coversCanvas(tag)) continue;
    const opacity = Number(tag.match(/\bopacity=["']([0-9.]+)["']/iu)?.[1] ?? 1);
    const fillOpacity = Number(tag.match(/\bfill-opacity=["']([0-9.]+)["']/iu)?.[1] ?? 1);
    const fill = tag.match(/\bfill=["']([^"']+)["']/iu)?.[1]
      ?? tag.match(/\bfill\s*:\s*([^;"']+)/iu)?.[1]
      ?? (tag.startsWith("<image") ? "embedded-image" : "black");
    if (opacity > 0 && fillOpacity > 0 && opaquePaint(fill)) opaqueCanvas = true;
  }
  return {
    ...size,
    format: "svg",
    transparencyStatus: opaqueCanvas ? "opaque" : "verified-transparent"
  };
}

function pngInspection(buffer) {
  const size = pngSize(buffer);
  if (!size) return null;
  const bitDepth = buffer[24];
  const colorType = buffer[25];
  const interlace = buffer[28];
  const chunks = [];
  let offset = 8;
  let hasTransparencyChunk = false;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) break;
    if (type === "IDAT") chunks.push(buffer.subarray(dataStart, dataEnd));
    if (type === "tRNS") hasTransparencyChunk = true;
    offset = dataEnd + 4;
    if (type === "IEND") break;
  }
  if (hasTransparencyChunk) {
    return {...size, format: "png", transparencyStatus: "verified-transparent"};
  }
  if (![4, 6].includes(colorType)) {
    return {...size, format: "png", transparencyStatus: "opaque"};
  }
  if (bitDepth !== 8 || interlace !== 0 || chunks.length === 0) {
    return {...size, format: "png", transparencyStatus: "unknown"};
  }
  try {
    const bytesPerPixel = colorType === 6 ? 4 : 2;
    const stride = size.width * bytesPerPixel;
    const raw = inflateSync(Buffer.concat(chunks));
    let previous = Buffer.alloc(stride);
    let cursor = 0;
    for (let row = 0; row < size.height; row += 1) {
      const filter = raw[cursor];
      const scanline = Buffer.from(raw.subarray(cursor + 1, cursor + 1 + stride));
      cursor += stride + 1;
      for (let index = 0; index < stride; index += 1) {
        const left = index >= bytesPerPixel ? scanline[index - bytesPerPixel] : 0;
        const up = previous[index] ?? 0;
        const upperLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] : 0;
        if (filter === 1) scanline[index] = (scanline[index] + left) & 255;
        else if (filter === 2) scanline[index] = (scanline[index] + up) & 255;
        else if (filter === 3) scanline[index] = (scanline[index] + Math.floor((left + up) / 2)) & 255;
        else if (filter === 4) {
          const estimate = left + up - upperLeft;
          const pa = Math.abs(estimate - left);
          const pb = Math.abs(estimate - up);
          const pc = Math.abs(estimate - upperLeft);
          const predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upperLeft;
          scanline[index] = (scanline[index] + predictor) & 255;
        } else if (filter !== 0) {
          return {...size, format: "png", transparencyStatus: "unknown"};
        }
      }
      const alphaOffset = bytesPerPixel - 1;
      for (let index = alphaOffset; index < stride; index += bytesPerPixel) {
        if (scanline[index] < 255) {
          return {...size, format: "png", transparencyStatus: "verified-transparent"};
        }
      }
      previous = scanline;
    }
    return {...size, format: "png", transparencyStatus: "opaque"};
  } catch {
    return {...size, format: "png", transparencyStatus: "unknown"};
  }
}

function rasterTransparency(buffer, format) {
  if (format === "webp") {
    const hasAlpha = buffer.includes(Buffer.from("ALPH"))
      || (buffer.toString("ascii", 12, 16) === "VP8X" && Boolean(buffer[20] & 0x10));
    return hasAlpha ? "verified-transparent" : "opaque";
  }
  if (format === "gif") {
    for (let index = 0; index + 7 < buffer.length; index += 1) {
      if (buffer[index] === 0x21 && buffer[index + 1] === 0xf9 && buffer[index + 2] === 0x04) {
        return buffer[index + 3] & 0x01 ? "verified-transparent" : "opaque";
      }
    }
    return "opaque";
  }
  return format === "jpeg" ? "opaque" : "unknown";
}

export async function inspectImageAsset(file) {
  const buffer = await readFile(file);
  const png = pngInspection(buffer);
  if (png) return png;
  const svg = svgInspection(buffer);
  if (svg) return svg;
  const jpeg = jpegSize(buffer);
  const extension = path.extname(file).toLowerCase();
  const format = jpeg ? "jpeg" : extension === ".webp" ? "webp" : extension === ".gif" ? "gif" : extension.slice(1) || "unknown";
  return {
    ...(jpeg ?? {}),
    format,
    transparencyStatus: rasterTransparency(buffer, format)
  };
}

export async function readImageSize(file) {
  const inspected = await inspectImageAsset(file);
  return inspected.width && inspected.height
    ? {width: inspected.width, height: inspected.height}
    : null;
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
  const independent = asset.independent ?? (COVER_ROLES.has(role) || COMPONENT_ROLES.has(role));
  const cropAllowed = ORIGINAL_ROLES.has(role) ? false : asset.allowCrop === true;
  const targetWidth = Number(asset.targetWidth ?? width ?? 0) || null;
  const targetHeight = Number(asset.targetHeight ?? height ?? 0) || null;
  const frameContentWidth = Number(asset.frameContentWidth ?? targetWidth ?? 0) || null;
  const frameContentHeight = Number(asset.frameContentHeight ?? targetHeight ?? 0) || null;
  const imageRatio = width && height ? width / height : null;
  const frameRatio = frameContentWidth && frameContentHeight
    ? frameContentWidth / frameContentHeight
    : null;
  const frameRatioDelta = imageRatio && frameRatio
    ? Math.abs(imageRatio - frameRatio) / imageRatio
    : null;
  const defaultEdgeTreatment = COMPONENT_ROLES.has(role)
    ? "die-cut-transparent"
    : ORIGINAL_ROLES.has(role)
      ? "torn-paper-frame"
      : "flush";
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
    targetWidth,
    targetHeight,
    frameContentWidth,
    frameContentHeight,
    frameRatioDelta,
    frameFitStatus: frameRatioDelta === null
      ? "unknown"
      : frameRatioDelta <= 0.025
        ? "matched"
        : "mismatch",
    aspectClass: asset.aspectClass ?? aspectClass(width, height),
    fitPolicy: cropAllowed ? "cover-allowed" : "contain-complete",
    allowCrop: cropAllowed,
    edgeTreatment: asset.edgeTreatment ?? defaultEdgeTreatment,
    framePaddingRatio: Number(asset.framePaddingRatio ?? (ORIGINAL_ROLES.has(role) ? 0.035 : 0.02)),
    backgroundMode: asset.backgroundMode ?? (COMPONENT_ROLES.has(role) ? "unknown" : "opaque"),
    detectedFormat: asset.detectedFormat ?? null,
    transparencyStatus: asset.transparencyStatus ?? "unknown"
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
  if (!EDGE_TREATMENTS.has(asset?.edgeTreatment)) failures.push("unknown-edge-treatment");
  if (asset?.frameRatioDelta === null || asset?.frameRatioDelta === undefined) {
    failures.push("frame-ratio-unmeasured");
  } else if (asset.frameRatioDelta > 0.025) {
    failures.push("frame-image-ratio-mismatch");
  }
  if (Number(asset?.framePaddingRatio ?? 0) > 0.07) failures.push("frame-padding-too-large");
  if (ORIGINAL_ROLES.has(asset?.role) && ["organic-window", "die-cut-transparent"].includes(asset.edgeTreatment)) {
    failures.push("original-photo-mask-forbidden");
  }
  if (asset?.edgeTreatment === "organic-window" && !asset.safeSubjectBounds && !TRANSPARENT_COMPONENT_MODES.has(asset.backgroundMode)) {
    failures.push("irregular-window-safe-subject-missing");
  }
  if (asset?.allowCrop === true && !asset.safeSubjectBounds) failures.push("crop-safe-subject-missing");
  if (COMPONENT_ROLES.has(asset?.role)) {
    if (asset.independent !== true) failures.push("supporting-component-not-independent");
    if (["sheet-crop", "fraction-crop"].includes(asset.generationMode)) {
      failures.push("supporting-component-crop-forbidden");
    }
    if (asset.allowCrop === true) failures.push("supporting-component-crop-forbidden");
    if (!TRANSPARENT_COMPONENT_MODES.has(asset.backgroundMode)) {
      failures.push("supporting-component-background-not-transparent");
    }
    if (!asset.edgeTreatment || asset.edgeTreatment !== "die-cut-transparent") {
      failures.push("supporting-component-not-die-cut");
    }
    if (asset.backgroundMode === "svg-vector" && asset.detectedFormat !== "svg") {
      failures.push("supporting-component-format-mismatch");
    }
    if (asset.transparencyStatus === "opaque") {
      failures.push("supporting-component-actual-background-opaque");
    } else if (asset.transparencyStatus !== "verified-transparent") {
      failures.push("supporting-component-transparency-unverified");
    }
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
