/**
 * Barretenberg (bb.js) writes CRS files under HOME/.bb-crs, or ./.bb-crs when
 * HOME is unset. Vercel/Lambda cwd is /var/task (read-only). Point both at /tmp
 * before @zkpassport/sdk loads UltraHonkVerifierBackend.
 */
import { accessSync, constants, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const writableRoot = tmpdir();
const crsDir = join(writableRoot, ".bb-crs");

mkdirSync(crsDir, { recursive: true });

process.env.CRS_PATH = crsDir;
process.env.BB_CRS_PATH = crsDir;
process.env.TMPDIR = writableRoot;

function cwdWritable() {
  try {
    accessSync(process.cwd(), constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

// Vercel serves the function from a read-only directory. A normal server keeps
// its own working directory so later reads of dist/ and the catalog stay put.
// A read-only image with HAPPYVOTE_DATA_DIR keeps that directory: CRS is already under /tmp.
if (!cwdWritable() && !process.env.HAPPYVOTE_DATA_DIR) {
  process.env.HOME = writableRoot;
  try {
    process.chdir(writableRoot);
  } catch (error) {
    throw new Error(
      `Cannot chdir to writable CRS dir ${writableRoot}: ${error?.message || error}`,
    );
  }
}
