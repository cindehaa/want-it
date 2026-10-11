// pnpm tsx scripts/dial-smoke.ts
// Read-only check of Dial auth + number config. Places NO call and changes nothing (GET /calls, GET /numbers only).
import fs from "node:fs";
import path from "node:path";

function loadEnv(file: string) {
  const p = path.join(process.cwd(), file);
  if (!fs.existsSync(p)) return false;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    let v = m[2];
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, ""); // strip trailing inline comment
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
  return true;
}

async function main() {
  const loaded = [".env.local", ".env"].filter(loadEnv);
  console.log(`env files loaded: ${loaded.length ? loaded.join(", ") : "none (using process env only)"}`);

  const vars = ["DIAL_API_KEY", "DIAL_BASE_URL", "DIAL_FROM_NUMBER_ID", "DIAL_FROM_NUMBER", "DIAL_VENDOR_NUMBER_ID", "DIAL_VENDOR_PHONE", "VENDOR_MODE", "CERTLY_PHONE", "VANTLY_PHONE", "ANTHROPIC_API_KEY"];
  for (const k of vars) console.log(`  ${k.padEnd(22)} ${process.env[k]?.trim() ? "set" : "MISSING"}`);

  if (!process.env.DIAL_API_KEY?.trim()) {
    console.log("\nDIAL_API_KEY is not set; cannot check Dial auth. Add it to .env.local and re-run.");
    process.exitCode = 1;
    return;
  }

  const { listCalls, listNumbers, dialBaseInUse } = await import("../lib/dial/client");

  const calls = await listCalls({ direction: "outbound" });
  if (!calls.ok) {
    console.log(`\nAUTH/LIST CALLS: FAILED -> ${calls.error}`);
    process.exitCode = 1;
  } else {
    console.log(`\nAUTH/LIST CALLS: ok (base ${dialBaseInUse()}); ${calls.data.count} outbound call(s) on the account`);
    for (const c of calls.data.calls.slice(0, 3)) console.log(`  ${c.dialCallId}  ${c.state}${c.terminationType ? `/${c.terminationType}` : ""}  ${c.durationSeconds ?? "?"}s  ${c.transcriptTurns ? `${c.transcriptTurns.length} turns` : "no transcript"}`);
  }

  const nums = await listNumbers();
  if (!nums.ok) {
    console.log(`LIST NUMBERS: FAILED -> ${nums.error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`LIST NUMBERS: ok; ${nums.data.length} number(s)`);
  for (const n of nums.data) console.log(`  ${n.id}  ${n.number ?? "?"}  nickname=${n.nickname ?? "-"}  inboundInstruction=${n.inboundInstruction ? `${n.inboundInstruction.length} chars` : "none"}`);

  const check = (label: string, id: string | undefined) => {
    if (!id?.trim()) return;
    const hit = nums.data.find((n) => n.id === id.trim());
    console.log(`  ${label}=${id.trim()} -> ${hit ? `found (${hit.number ?? "?"})` : "NOT FOUND on this account"}`);
    if (!hit) process.exitCode = 1;
    return hit;
  };
  check("DIAL_FROM_NUMBER_ID", process.env.DIAL_FROM_NUMBER_ID);
  const vendorNum = check("DIAL_VENDOR_NUMBER_ID", process.env.DIAL_VENDOR_NUMBER_ID);
  if (vendorNum?.number && process.env.DIAL_VENDOR_PHONE && vendorNum.number !== process.env.DIAL_VENDOR_PHONE.trim()) {
    console.log(`  WARNING: DIAL_VENDOR_PHONE (${process.env.DIAL_VENDOR_PHONE}) does not match the vendor number's E.164 (${vendorNum.number})`);
  }
  console.log("\nNo call was placed and nothing was modified.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
