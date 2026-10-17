import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { spawnSync } from "node:child_process";

const config = {
  ...(existsSync(".env.local")
    ? parseEnv(readFileSync(".env.local", "utf8"))
    : {}),
  ...process.env,
};
const required = [
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_DB_PASSWORD",
  "SUPABASE_PROJECT_REF",
];
const missing = required.filter((key) => !config[key]);
if (missing.length) {
  console.error(`Missing local environment: ${missing.join(", ")}`);
  process.exit(1);
}
let ref = config.SUPABASE_PROJECT_REF;
if (ref.startsWith("https://")) {
  const referenceUrl = new URL(ref);
  ref =
    referenceUrl.hostname === "supabase.com"
      ? referenceUrl.pathname.match(/\/project\/([a-z0-9]{20})(?:\/|$)/)?.[1]
      : referenceUrl.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/)?.[1];
}
if (
  !ref ||
  !/^[a-z0-9]{20}$/.test(ref) ||
  new URL(config.VITE_SUPABASE_URL).hostname !== `${ref}.supabase.co`
) {
  console.error("Project reference does not match frontend configuration.");
  process.exit(1);
}
config.SUPABASE_PROJECT_REF = ref;
const commands = {
  link: ["link", "--project-ref", ref],
  push: ["db", "push", "--yes"],
  plan: ["db", "push", "--dry-run"],
  deploy: ["functions", "deploy", "lesreport", "--project-ref", ref],
  origins: [
    "secrets",
    "set",
    "ALLOWED_ORIGINS=https://lms.daztore.web.id,http://localhost:3000,http://127.0.0.1:3000",
    "--project-ref",
    ref,
  ],
};
const action = process.argv[2];
if (!commands[action]) {
  console.error("Use link, plan, push, origins or deploy");
  process.exit(1);
}
const args = ["--no-install", "supabase", ...commands[action]];
const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  args,
  {
    env: config,
    encoding: "utf8",
    shell: process.platform === "win32",
    maxBuffer: 4 * 1024 * 1024,
  },
);
let output = (result.stdout || "") + (result.stderr || "");
for (const name of ["SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD"])
  output = output.replaceAll(config[name], "[REDACTED]");
console.log(output);
if (result.error) console.error("CLI could not start.");
process.exit(result.status ?? 1);
