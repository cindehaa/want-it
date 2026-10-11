// One real Dial call, placed and polled through the want-it backend (app/api/hack/call). Vite proxies /api there.
export type Turn = { speaker: string; text: string; startMs: number }
export type CallStatus = "queued" | "in_progress" | "ended" | "transcribed" | "failed"
export type LiveCall = { dialCallId: string; to: string; status: CallStatus }
export type CallView = { dialCallId: string; status: CallStatus; state: string; transcriptTurns: Turn[]; durationSeconds: number | null; error: string | null }

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(body.error ?? `${res.status} ${res.statusText}`)
  return body
}

export const placeCall = () => fetch("/api/hack/call", { method: "POST" }).then((r) => json<LiveCall>(r))
export const pollCall = (id: string) => fetch(`/api/hack/call?id=${encodeURIComponent(id)}`).then((r) => json<CallView>(r))
export const isFinal = (s: CallStatus) => s === "ended" || s === "transcribed" || s === "failed"
