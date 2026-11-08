/**
 * JSON files on the site host.
 * HAPPYVOTE_DATA_DIR is an absolute directory mounted outside the image.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL("..", import.meta.url));

let tail = Promise.resolve();

export function dataDir() {
  const configured = process.env.HAPPYVOTE_DATA_DIR;
  if (configured != null && String(configured).trim() !== "") {
    const dir = String(configured).trim();
    if (!isAbsolute(dir)) {
      throw new Error("HAPPYVOTE_DATA_DIR must be an absolute path");
    }
    return dir;
  }
  return join(webRoot, "data", "runtime");
}

export function withStoreLock(fn) {
  const run = tail.then(() => fn());
  tail = run.then(
    () => {},
    () => {},
  );
  return run;
}

export async function readJson(name) {
  const file = join(dataDir(), name);
  let text;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${name} is not valid JSON`);
    }
    throw error;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${name} must be a JSON object`);
  }
  return data;
}

export async function writeJson(name, value) {
  const file = join(dataDir(), name);
  await mkdir(dataDir(), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmp, file);
  return { file };
}
