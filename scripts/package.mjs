import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeZip } from "./lib/zip.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await fs.readFile(path.join(root, "MANIFEST.json"), "utf8"));
const files = {};
for (const name of manifest.files) {
  if (name.startsWith("/") || name.split("/").includes("..")) throw new Error("Unsafe manifest path.");
  const file = path.join(root, name);
  if ((await fs.lstat(file)).isSymbolicLink()) throw new Error("Package source must not contain symlinks: " + name);
  files[name] = await fs.readFile(file, "utf8");
}
const out = path.join(root, "dist");
await fs.mkdir(out, { recursive: true });
const skill = Object.fromEntries(Object.entries(files).filter(([name]) => name.startsWith("eval-hillclimb/")));
skill["eval-hillclimb/LICENSE"] = files.LICENSE;
await fs.writeFile(path.join(out, "eval-hillclimb-repo.zip"), makeZip(files, "eval-hillclimb/"));
await fs.writeFile(path.join(out, "eval-hillclimb-skill.zip"), makeZip(skill));
console.log("Created dist/eval-hillclimb-repo.zip and dist/eval-hillclimb-skill.zip");
