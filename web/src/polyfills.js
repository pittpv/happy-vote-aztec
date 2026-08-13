/**
 * Browser globals required by @aztec/* (Node-style Buffer/process).
 * Must load before any Aztec imports.
 */
import { Buffer } from "buffer";
import process from "process";

globalThis.Buffer = globalThis.Buffer ?? Buffer;
globalThis.process = globalThis.process ?? process;
globalThis.global = globalThis.global ?? globalThis;
