import {mkdir, readFile, rename, writeFile} from "node:fs/promises";
import path from "node:path";
import {randomUUID} from "node:crypto";

export async function ensureDir(directory) {
  await mkdir(directory, {recursive: true});
}

export async function readJsonIfExists(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

export async function atomicWriteText(filePath, text) {
  await ensureDir(path.dirname(filePath));
  const temporary = `${filePath}.tmp-${randomUUID()}`;
  await writeFile(temporary, text, "utf8");
  await rename(temporary, filePath);
}

export async function atomicWriteJson(filePath, value) {
  await atomicWriteText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
