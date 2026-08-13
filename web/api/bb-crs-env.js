/**
 * Barretenberg (bb.js) writes CRS files under HOME/.bb-crs, or ./.bb-crs when
 * HOME is unset. Vercel/Lambda cwd is /var/task (read-only). Point both at /tmp
 * before @zkpassport/sdk loads UltraHonkVerifierBackend.
 */
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const writableRoot = tmpdir();
const crsDir = join(writableRoot, ".bb-crs");

mkdirSync(crsDir, { recursive: true });

process.env.CRS_PATH = crsDir;
process.env.BB_CRS_PATH = crsDir;
process.env.HOME = writableRoot;
process.env.TMPDIR = writableRoot;

try {
  if (process.cwd() !== writableRoot) {
    process.chdir(writableRoot);
  }
} catch (error) {
  throw new Error(
    `Cannot chdir to writable CRS dir ${writableRoot}: ${error?.message || error}`,
  );
}
