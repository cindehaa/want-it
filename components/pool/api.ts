export type ApiResult = { ok: true; data: unknown } | { ok: false; error: string };

function messageFrom(data: unknown, fallback: string): string {
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    const e = d.error ?? d.message;
    if (typeof e === "string") return e;
    if (e && typeof e === "object") {
      const m = (e as Record<string, unknown>).message;
      if (typeof m === "string") return m;
      try {
        return JSON.stringify(e);
      } catch {
        /* fall through */
      }
    }
  }
  return fallback;
}

async function requestJson(path: string, init?: RequestInit): Promise<ApiResult> {
  try {
    const res = await fetch(path, init);
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON body */
    }
    if (!res.ok) return { ok: false, error: messageFrom(data, `${res.status} ${res.statusText || "request failed"}`) };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

export function postJson(path: string, body: unknown): Promise<ApiResult> {
  return requestJson(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function getJson(path: string): Promise<ApiResult> {
  return requestJson(path, { cache: "no-store" });
}

export function deleteJson(path: string): Promise<ApiResult> {
  return requestJson(path, { method: "DELETE" });
}
