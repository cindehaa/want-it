import { z } from "zod";

const Tool = z.object({
  name: z.string(), description: z.string().optional(),
  inputSchema: z.object({ properties: z.record(z.string(), z.unknown()).optional(), required: z.array(z.string()).optional() }).passthrough(),
});
export type McpTool = z.infer<typeof Tool>;
const RpcReply = z.object({ id: z.union([z.string(), z.number()]).optional(), result: z.unknown().optional(), error: z.unknown().optional() });

// This client implements only the Streamable HTTP calls needed by the demo.
export class KeewanoMcp {
  private session: string | null = null;
  private protocol = "2025-03-26";
  private nextId = 1;
  constructor(private token: string, private signal: AbortSignal) {}

  private async request(method: string, params: unknown, notification = false): Promise<unknown> {
    const id = notification ? undefined : this.nextId++;
    const response = await fetch("https://api.keewano.com/mcp", {
      method: "POST",
      headers: {
        "k-token": this.token, "Content-Type": "application/json", Accept: "application/json, text/event-stream",
        ...(method !== "initialize" ? { "MCP-Protocol-Version": this.protocol } : {}),
        ...(this.session ? { "Mcp-Session-Id": this.session } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", ...(id === undefined ? {} : { id }), method, params }),
      signal: this.signal,
    });
    if (!response.ok) throw new Error(`Keewano MCP ${method} HTTP ${response.status}`);
    this.session = response.headers.get("mcp-session-id") ?? this.session;
    if (notification) { await response.body?.cancel(); return undefined; }
    if (response.headers.get("content-type")?.includes("text/event-stream")) {
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Empty Keewano MCP stream");
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, "\n");
          let end: number;
          while ((end = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, end); buffer = buffer.slice(end + 2);
            const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
            if (!data) continue;
            const reply = RpcReply.parse(JSON.parse(data));
            if (reply.id === id) {
              if (reply.error) throw new Error("Keewano MCP returned a protocol error");
              return reply.result;
            }
          }
        }
        throw new Error("Keewano MCP stream ended without a result");
      } finally { await reader.cancel().catch(() => {}); }
    }
    const reply = RpcReply.parse(await response.json());
    if (reply.id !== id || reply.error) throw new Error("Keewano MCP returned a protocol error");
    return reply.result;
  }

  async connect(): Promise<void> {
    const result = z.object({ protocolVersion: z.string() }).parse(await this.request("initialize", {
      protocolVersion: this.protocol, capabilities: {}, clientInfo: { name: "want-it", version: "0.1.0" },
    }));
    this.protocol = result.protocolVersion;
    await this.request("notifications/initialized", {}, true);
  }

  async tools(): Promise<McpTool[]> {
    const tools: McpTool[] = [];
    let cursor: string | undefined;
    do {
      const page = z.object({ tools: z.array(Tool), nextCursor: z.string().optional() }).parse(await this.request("tools/list", cursor ? { cursor } : {}));
      tools.push(...page.tools); cursor = page.nextCursor;
    } while (cursor);
    return tools;
  }

  async call(name: string, args: Record<string, unknown>): Promise<unknown> {
    const result = z.object({ isError: z.boolean().optional(), structuredContent: z.unknown().optional(), content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional() }).parse(await this.request("tools/call", { name, arguments: args }));
    if (result.isError) throw new Error(`Keewano tool ${name} failed; run check.ts --discover to inspect its schema`);
    if (result.structuredContent) return result.structuredContent;
    const text = result.content?.filter((part) => part.type === "text").map((part) => part.text ?? "").join("\n") ?? "";
    try { return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")); }
    catch { throw new Error(`Keewano tool ${name} returned non-JSON data; inspect the result format`); }
  }

  async close(): Promise<void> {
    if (!this.session) return;
    await fetch("https://api.keewano.com/mcp", {
      method: "DELETE", headers: { "k-token": this.token, "Mcp-Session-Id": this.session, "MCP-Protocol-Version": this.protocol },
      signal: AbortSignal.timeout(1000),
    }).catch(() => {});
  }
}

export function sqlTool(tools: McpTool[], projectId?: string): { name: string; args: (sql: string) => Record<string, unknown> } {
  const candidates = tools.filter((tool) => {
    const properties = tool.inputSchema.properties ?? {};
    return /sql/i.test(`${tool.name} ${tool.description ?? ""}`) && Object.keys(properties).some((key) => /^(sql|query|sql_query|sqlQuery|queryText)$/i.test(key));
  });
  if (candidates.length !== 1) throw new Error("Keewano SQL tool is ambiguous or missing; run check.ts --discover");
  const tool = candidates[0];
  const properties = tool.inputSchema.properties ?? {};
  const queryKey = Object.keys(properties).find((key) => /^(sql|query|sql_query|sqlQuery|queryText)$/i.test(key))!;
  const args: Record<string, unknown> = {};
  for (const key of tool.inputSchema.required ?? []) {
    if (key === queryKey) continue;
    if (/^(project_?id|project_?uuid)$/i.test(key) && projectId) args[key] = projectId;
    else throw new Error(`Keewano SQL tool requires ${key}; set KEEWANO_PROJECT_ID if this is the project identifier, or inspect check.ts --discover`);
  }
  return { name: tool.name, args: (sql) => ({ ...args, [queryKey]: sql }) };
}

export function oneRow(data: unknown): Record<string, unknown> {
  if (Array.isArray(data) && data.length === 1 && typeof data[0] === "object" && data[0] !== null) return data[0];
  if (data && typeof data === "object") {
    const object = data as Record<string, unknown>;
    for (const key of ["rows", "data", "result", "results"]) {
      if (object[key] !== undefined) {
        if (Array.isArray(object[key]) && Array.isArray((object[key] as unknown[])[0])) {
          const columns = object.columns;
          const rows = object[key] as unknown[][];
          if (Array.isArray(columns) && rows.length === 1) return Object.fromEntries(columns.map((column, i) => [typeof column === "string" ? column : column.name, rows[0][i]]));
        }
        return oneRow(object[key]);
      }
    }
    return object;
  }
  throw new Error("Keewano SQL result must contain exactly one row");
}
