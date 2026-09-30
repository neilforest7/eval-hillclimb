// Run from an unpacked, reviewed source bundle. Tests finish before repo creation.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (key, fallback) => {
  const index = args.indexOf("--" + key);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error("Missing --" + key + " value");
  return args[index + 1];
};
function command(program, argv, { capture = false, allowFailure = false } = {}) {
  const result = spawnSync(program, argv, { cwd: root, encoding: "utf8", stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit" });
  if (!allowFailure && result.status !== 0) throw new Error(program + " failed" + (capture ? ": " + (result.stderr || result.error?.message || result.status) : ""));
  return result;
}
async function exists(file) { try { await fs.access(file); return true; } catch { return false; } }
async function installGh() {
  const platform = process.platform === "linux" ? "linux" : process.platform === "darwin" ? "macOS" : null;
  const arch = { x64: "amd64", arm64: "arm64" }[process.arch];
  if (!platform || !arch) throw new Error("Install gh for this platform from https://cli.github.com/ and rerun.");
  const extension = platform === "linux" ? ".tar.gz" : ".zip";
  const headers = { "User-Agent": "eval-hillclimb-publisher" };
  const metadataResponse = await fetch("https://api.github.com/repos/cli/cli/releases/latest", { headers });
  if (!metadataResponse.ok) throw new Error("Unable to find official gh release: HTTP " + metadataResponse.status);
  const metadata = await metadataResponse.json();
  const asset = metadata.assets.find(a => a.name.endsWith("_" + platform + "_" + arch + extension));
  const checksumAsset = metadata.assets.find(a => a.name.endsWith("_checksums.txt"));
  if (!asset || !checksumAsset) throw new Error("Official release lacks the expected archive/checksum file.");
  const checksResponse = await fetch(checksumAsset.browser_download_url);
  if (!checksResponse.ok) throw new Error("Unable to download gh checksums.");
  const checks = (await checksResponse.text()).split(/\r?\n/).map(line => line.trim().split(/\s+/));
  const expected = checks.find(parts => parts[1]?.replace(/^\*/, "") === asset.name)?.[0];
  if (!expected) throw new Error("Archive checksum is missing.");
  const download = await fetch(asset.browser_download_url);
  if (!download.ok) throw new Error("Unable to download gh archive.");
  const bytes = Buffer.from(await download.arrayBuffer());
  if (crypto.createHash("sha256").update(bytes).digest("hex") !== expected.toLowerCase()) throw new Error("gh archive checksum mismatch.");
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "gh-install-"));
  try {
    const archive = path.join(temporary, asset.name);
    await fs.writeFile(archive, bytes);
    if (extension === ".tar.gz") command("tar", ["-xzf", archive, "-C", temporary]);
    else command("unzip", ["-q", archive, "-d", temporary]);
    const directory = asset.name.replace(/\.tar\.gz$|\.zip$/, "");
    const executable = path.join(temporary, directory, "bin", "gh");
    if (!await exists(executable)) throw new Error("gh executable not found after extraction.");
    const bin = path.join(os.homedir(), ".local", "bin");
    await fs.mkdir(bin, { recursive: true });
    const installed = path.join(bin, "gh");
    await fs.copyFile(executable, installed); await fs.chmod(installed, 0o755);
    return installed;
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
}
try {
  if (Number(process.versions.node.split(".")[0]) < 22) throw new Error("Node.js 22+ is required.");
  command("git", ["--version"]);
  const testFiles = (await fs.readdir(path.join(root, "tests"))).filter(name => name.endsWith(".test.mjs")).map(name => path.join(root, "tests", name));
  command(process.execPath, ["--test", ...testFiles]);
  command(process.execPath, [path.join(root, "scripts/demo.mjs")]);
  let gh = "gh";
  if (command(gh, ["--version"], { capture: true, allowFailure: true }).status !== 0) {
    const local = path.join(os.homedir(), ".local", "bin", "gh");
    if (await exists(local)) gh = local;
    else if (args.includes("--install-gh")) gh = await installGh();
    else throw new Error("gh is missing; rerun with --install-gh or install it from https://cli.github.com/.");
  }
  if (command(gh, ["auth", "status", "--hostname", "github.com"], { capture: true, allowFailure: true }).status !== 0) {
    command(gh, ["auth", "login", "--hostname", "github.com", "--git-protocol", "https", "--web", "--scopes", "workflow"]);
  }
  // Classic/OAuth tokens require workflow scope to push the included CI workflow.
  const oauthScopes = () => {
    const response = command(gh, ["api", "--include", "user"], { capture: true }).stdout;
    const header = response.match(/^x-oauth-scopes:[ \t]*([^\r\n]*)/im);
    return header ? header[1].split(",").map(scope => scope.trim()).filter(Boolean) : null;
  };
  let scopes = oauthScopes();
  if (scopes !== null && !scopes.includes("workflow")) {
    if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) {
      throw new Error("The environment-provided GitHub token lacks workflow scope. Supply a token with repo and workflow access before creating the repository.");
    }
    command(gh, ["auth", "refresh", "--hostname", "github.com", "--scopes", "workflow"]);
    scopes = oauthScopes();
    if (scopes !== null && !scopes.includes("workflow")) throw new Error("GitHub authentication still lacks workflow scope.");
  }
  // Fine-grained tokens do not expose OAuth scopes; their workflow write permission is managed on GitHub.
  const profile = JSON.parse(command(gh, ["api", "user"], { capture: true }).stdout);
  const owner = option("owner", profile.login), name = option("name", "eval-hillclimb");
  if (owner !== profile.login) throw new Error("--owner must match the authenticated personal account: " + profile.login);
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) throw new Error("Invalid repository name.");
  const repo = owner + "/" + name;
  if (command(gh, ["repo", "view", repo, "--json", "name"], { capture: true, allowFailure: true }).status === 0) {
    throw new Error("Repository already exists. This publisher creates a new repository and will not overwrite it: " + repo);
  }
  const existingRoot = command("git", ["rev-parse", "--show-toplevel"], { capture: true, allowFailure: true });
  if (existingRoot.status === 0 && path.resolve(existingRoot.stdout.trim()) !== root) throw new Error("Bundle is inside another Git repository; move it outside before publishing.");
  if (!await exists(path.join(root, ".git"))) command("git", ["init", "-b", "main"]);
  if (command("git", ["remote"], { capture: true }).stdout.trim()) throw new Error("Existing Git remotes found; publish from a fresh bundle.");
  if (command("git", ["diff", "--cached", "--name-only"], { capture: true }).stdout.trim()) throw new Error("Existing staged changes found; review them before publishing.");
  if (command("git", ["config", "user.name"], { capture: true, allowFailure: true }).status !== 0) command("git", ["config", "user.name", profile.login]);
  if (command("git", ["config", "user.email"], { capture: true, allowFailure: true }).status !== 0) command("git", ["config", "user.email", profile.id + "+" + profile.login + "@users.noreply.github.com"]);
  command("git", ["add", "--", "README.md", "README.zh-CN.md", "LICENSE", "MANIFEST.json", ".gitignore", ".github", "package.json", "eval-hillclimb", "examples", "tests", "scripts", "docs"]);
  if (command("git", ["diff", "--cached", "--name-only"], { capture: true }).stdout.trim()) command("git", ["commit", "-m", "feat: release portable eval and hillclimb skill"]);
  command(gh, ["auth", "setup-git", "--hostname", "github.com"]);
  command(gh, ["repo", "create", repo, "--public", "--description", "Portable evaluation and hillclimbing skill for Codex and ChatGPT", "--source", root, "--remote", "origin", "--push"]);
  console.log("Published: https://github.com/" + repo);
} catch (error) {
  console.error("Publish stopped: " + error.message);
  process.exitCode = 1;
}
