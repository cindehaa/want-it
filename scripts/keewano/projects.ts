// Lists Keewano projects visible to KEEWANO_PAT (to find KEEWANO_PROJECT_ID).
import { KeewanoMcp } from "../../lib/keewano/mcp";
import { loadEnv } from "./env";

async function main() {
  loadEnv();
  const mcp = new KeewanoMcp(process.env.KEEWANO_PAT!.trim(), AbortSignal.timeout(20000));
  await mcp.connect();
  console.log(JSON.stringify(await mcp.call("list_projects", {}), null, 2));
  await mcp.close();
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
