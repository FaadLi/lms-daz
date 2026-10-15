import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
const config = {
  ...parseEnv(readFileSync(".env.local", "utf8")),
  ...process.env,
};
const url = config.VITE_SUPABASE_URL;
const key = config.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error("Missing public Supabase configuration");
for (const path of [
  "/auth/v1/settings",
  "/rest/v1/lms_children?select=id&limit=1",
]) {
  try {
    const response = await fetch(url + path, { headers: { apikey: key } });
    const data = await response.json();
    console.log(
      JSON.stringify({
        endpoint: path.split("?")[0],
        status: response.status,
        ...(path.includes("settings")
          ? { emailAuthEnabled: data.external?.email }
          : {
              code: data.code,
              rows: Array.isArray(data) ? data.length : undefined,
            }),
      }),
    );
  } catch {
    console.log(
      JSON.stringify({ endpoint: path.split("?")[0], reachable: false }),
    );
  }
}
console.log(
  JSON.stringify({
    privilegedVariables: Object.keys(config).filter((name) =>
      /^(SUPABASE_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|SUPABASE_DB_URL|DATABASE_URL)$/.test(
        name,
      ),
    ),
  }),
);
