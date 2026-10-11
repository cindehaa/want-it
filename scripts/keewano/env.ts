import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export function loadEnv(): void {
  for (const name of [".env.local", ".env"]) {
    const file = path.join(process.cwd(), name);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match) continue;
      const value = /^(['"]).*\1$/.test(match[2]) ? match[2].slice(1, -1) : match[2].replace(/\s+#.*$/, "");
      if (process.env[match[1]] === undefined) process.env[match[1]] = value;
    }
  }
}
