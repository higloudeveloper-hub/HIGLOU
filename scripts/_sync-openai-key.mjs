/**
 * Push OPENAI_API_KEY from .env.local to Vercel production + preview, then deploy.
 * Usage: node scripts/_sync-openai-key.mjs
 */
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";

function parseEnv(file) {
  const values = {};
  if (!existsSync(file)) return values;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    values[t.slice(0, i).trim()] = v;
  }
  return values;
}

const env = { ...parseEnv(".env"), ...parseEnv(".env.local") };
const key = env.OPENAI_API_KEY;
if (!key) {
  console.error("OPENAI_API_KEY missing in .env.local");
  process.exit(1);
}

const tmp = ".tmp-openai-key.txt";
writeFileSync(tmp, key, "utf8");

function run(cmd, args, inputFile) {
  console.log(">", cmd, args.join(" "));
  const result = spawnSync(cmd, args, {
    stdio: inputFile
      ? ["pipe", "inherit", "inherit"]
      : "inherit",
    shell: true,
    input: inputFile ? readFileSync(inputFile) : undefined,
    env: process.env,
  });
  if (result.status !== 0) {
    console.error("Command failed", cmd, args.join(" "), "exit", result.status);
  }
  return result.status ?? 1;
}

for (const target of ["production", "preview"]) {
  run("npx", ["vercel", "env", "rm", "OPENAI_API_KEY", target, "-y"]);
  run("npx", ["vercel", "env", "add", "OPENAI_API_KEY", target], tmp);
}

try {
  unlinkSync(tmp);
} catch {
  /* ignore */
}

const deploy = run("npx", ["vercel", "--prod", "--yes"]);
process.exit(deploy);
