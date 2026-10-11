import { getDemandEvidence } from "../../lib/keewano";
import { KeewanoMcp } from "../../lib/keewano/mcp";
import { loadEnv } from "./env";

async function main() {
  loadEnv();
  console.log(`KEEWANO_EVENT_KEY: ${process.env.KEEWANO_EVENT_KEY?.trim() ? "set" : "MISSING"}`);
  console.log(`KEEWANO_PAT: ${process.env.KEEWANO_PAT?.trim() ? "set" : "MISSING"}`);
  if (process.argv.includes("--discover")) {
    const token = process.env.KEEWANO_PAT?.trim();
    if (!token) throw new Error("KEEWANO_PAT is missing; tool discovery unavailable");
    const client = new KeewanoMcp(token, AbortSignal.timeout(8000));
    try {
      await client.connect();
      console.log(JSON.stringify(await client.tools(), null, 2));
    } finally { await client.close(); }
    return;
  }
  const evidence = await getDemandEvidence("soc2_compliance");
  console.log(JSON.stringify(evidence, null, 2));
  if (evidence.source !== "keewano_live") process.exitCode = 1;
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Keewano check failed"); process.exitCode = 1; });
