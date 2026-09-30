import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { spawn } from "node:child_process";
import { invariant, stableJSON, validateCases } from "./core.mjs";

export function options(argv = process.argv.slice(2)) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    invariant(argv[i].startsWith("--"), "Expected --option, got " + argv[i]);
    const key = argv[i].slice(2);
    invariant(!Object.hasOwn(result, key), "Duplicate option: " + key);
    result[key] = i + 1 < argv.length && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  }
  return result;
}
export function requireOption(opts, key) {
  invariant(typeof opts[key] === "string" && opts[key], "Missing --" + key);
  return opts[key];
}
export function hash(value) {
  return crypto.createHash("sha256").update(stableJSON(value)).digest("hex");
}
export async function readJSON(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}
export async function readJSONL(file) {
  const lines = (await fs.readFile(file, "utf8")).split(/\r?\n/);
  return lines.flatMap((line, index) => {
    if (!line.trim()) return [];
    try { return [JSON.parse(line)]; }
    catch (error) { throw new Error(file + ":" + (index + 1) + ": " + error.message); }
  });
}
export async function readCases(file) {
  return validateCases(await readJSONL(file));
}
export async function writeJSON(file, value) {
  await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
}
export async function writeJSONL(file, rows) {
  await fs.writeFile(file, rows.map(row => JSON.stringify(row)).join("\n") + "\n", { flag: "wx" });
}
export async function createDirectory(directory) {
  await fs.mkdir(path.dirname(path.resolve(directory)), { recursive: true });
  await fs.mkdir(directory); // Refuse to overwrite or mix an existing experiment.
}
export function resolveCommand(command, projectDir, skillDir) {
  invariant(Array.isArray(command) && command.length && command.every(x => typeof x === "string" && x), "command must be a non-empty array of strings");
  const replacements = { "{node}": process.execPath, "{project}": projectDir, "{skill}": skillDir };
  return command.map(arg => {
    for (const [key, value] of Object.entries(replacements)) arg = arg.split(key).join(value);
    return arg;
  });
}
export async function invoke(command, request, { timeout_ms = 30000, max_output_bytes = 1048576, keep_cwd = false } = {}) {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "eval-hillclimb-"));
  const started = performance.now();
  let retained = false;
  try {
    const result = await new Promise((resolve, reject) => {
      const detached = process.platform !== "win32";
      const child = spawn(command[0], command.slice(1), { cwd, detached, shell: false, stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "", stderr = "", bytes = 0, completed = false;
      const stop = () => {
        try { if (detached && child.pid) process.kill(-child.pid, "SIGKILL"); else child.kill("SIGKILL"); } catch {}
      };
      const finish = (error, value) => {
        if (completed) return;
        completed = true; clearTimeout(timer);
        if (error) { stop(); reject(error); } else resolve(value);
      };
      const timer = setTimeout(() => finish(new Error("adapter timeout after " + timeout_ms + "ms")), timeout_ms);
      const collect = (kind, chunk) => {
        bytes += Buffer.byteLength(chunk, "utf8");
        if (bytes > max_output_bytes) return finish(new Error("adapter output exceeds max_output_bytes"));
        if (kind === "stdout") stdout += chunk.toString("utf8"); else stderr += chunk.toString("utf8");
      };
      child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
      child.stdout.on("data", chunk => collect("stdout", chunk));
      child.stderr.on("data", chunk => collect("stderr", chunk));
      child.on("error", error => finish(error));
      child.stdin.on("error", error => finish(error));
      child.on("close", code => {
        if (completed) return;
        if (code !== 0) return finish(new Error("adapter exited " + code + ": " + stderr.slice(0, 2000)));
        try {
          const value = JSON.parse(stdout.trim());
          invariant(value && typeof value === "object" && !Array.isArray(value), "adapter response must be one JSON object");
          finish(null, { value, stderr, latency_ms: performance.now() - started });
        } catch (error) { finish(new Error("invalid adapter JSON: " + error.message)); }
      });
      child.stdin.end(JSON.stringify(request) + "\n");
    });
    if (keep_cwd) {
      retained = true;
      return { ...result, cwd, cleanup: () => fs.rm(cwd, { recursive: true, force: true }) };
    }
    return result;
  } finally {
    if (!retained) await fs.rm(cwd, { recursive: true, force: true });
  }
}
export async function cli(main) {
  try { await main(); }
  catch (error) { process.stderr.write("Error: " + error.message + "\n"); process.exitCode = 1; }
}
