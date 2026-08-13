import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { nodePolyfills } from "vite-plugin-node-polyfills";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const nodeModulesPath = path.resolve(__dirname, "node_modules");

/**
 * Preserve the original polyfill resolveId, then patch shim paths
 * (https://github.com/davidmyersdev/vite-plugin-node-polyfills/issues/81).
 */
function nodePolyfillsFix(options) {
  const plugin = nodePolyfills(options);
  const original = plugin.resolveId;

  return {
    ...plugin,
    async resolveId(source, importer, opts) {
      const m = /^vite-plugin-node-polyfills\/shims\/(buffer|global|process)$/.exec(source);
      if (m) {
        return `${nodeModulesPath}/vite-plugin-node-polyfills/shims/${m[1]}/dist/index.cjs`;
      }
      if (typeof original === "function") {
        return original.call(this, source, importer, opts);
      }
      if (original && typeof original.handler === "function") {
        return original.handler.call(this, source, importer, opts);
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    nodePolyfillsFix({
      include: ["assert", "buffer", "path", "process", "net", "tty", "util"],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
  ],
  resolve: {
    alias: {
      assert: require.resolve("assert/"),
    },
  },
  server: {
    port: 5174,
    host: true,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "credentialless",
    },
  },
  optimizeDeps: {
    include: ["pino", "pino/browser", "assert", "buffer", "process"],
    exclude: [
      "@aztec/noir-noirc_abi",
      "@aztec/noir-acvm_js",
      "@aztec/bb.js",
      "@aztec/noir-noir_js",
    ],
    esbuildOptions: {
      target: "esnext",
    },
  },
  build: {
    target: "esnext",
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
});
