"use client";

// The call wall (docs/design/Neg-CallWall.dc.html): live calls as large tiles you can join, finished and waiting calls
// as a ranked table, and a joined view that fills a card with the transcript. Every line comes from real calls and
// quotes in the lanes passed in; nothing here is sample data.
import { useEffect, useRef, useState } from "react";
import type { Call } from "@/lib/contracts";
import { fmtMmSs, usdSeat } from "@/components/pool/format";
import { rankLanes, type Lane } from "./derive";
import { isAgent } from "./VendorLane";

export const isLive = (l: Lane) => !!l.call && (l.status === "calling" || l.status === "transcribing");
const isDone = (l: Lane) => l.status === "extracted" || l.status === "failed" || l.status === "no_recording";

/** The last dollar figure the vendor said out loud, if any. */
export function spokenOffer(turns: Call["transcriptTurns"]): number | null {
  let found: number | null = null;
  for (const t of turns) {
    if (isAgent(t.speaker)) continue;
    const all = [...t.text.matchAll(/\$\s?(\d+(?:[.,]\d+)?)/g)];
    const last = all[all.length - 1];
    if (last) found = Number(last[1].replace(",", "."));
  }
  return found != null && Number.isFinite(found) ? found : null;
}

type Props = {
  lanes: Lane[];
  /** Replay from the recordings: lanes advance on a shared clock instead of wall time. */
  replaying: boolean;
  replayClockMs: number;
  replayEndMs: Record<string, number>;
  running: boolean;
  bestCents: number | null;
  /** The viewer joined a call (client state only). */
  joinedId: string | null;
  onJoin: (vendorId: string | null) => void;
};

export default function CallWall({ lanes, replaying, replayClockMs, replayEndMs, running, bestCents, joinedId, onJoin }: Props) {
  // Clock for live calls: ticks once a second while any call is in progress.
  const [tickNow, setTickNow] = useState(() => Date.now());
  const anyLive = lanes.some(isLive);
  useEffect(() => {
    if (!anyLive || replaying) return;
    const id = setInterval(() => setTickNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [anyLive, replaying]);

  const elapsed = (l: Lane): number => {
    if (!l.call) return 0;
    if (replaying) return Math.min(replayClockMs, replayEndMs[l.vendor.id] ?? 0);
    if (isLive(l)) return Math.max(0, tickNow - new Date(l.call.startedAt).getTime());
    if (l.call.source === "live" && l.call.endedAt) return Math.max(0, new Date(l.call.endedAt).getTime() - new Date(l.call.startedAt).getTime());
    return l.call.transcriptTurns.reduce((m, t) => Math.max(m, t.startMs), 0);
  };

  const offerText = (l: Lane): string => {
    if (isLive(l)) {
      const o = spokenOffer(l.call?.transcriptTurns ?? []);
      if (o != null) return `Offer on the table $${o.toFixed(2)}`;
      const cite = l.bestBefore ?? bestCents;
      return cite != null ? `No offer yet. Citing ${usdSeat(cite)}` : "No offer yet. Nothing to cite before this call";
    }
    if (l.quotedTier) return `Quote ${usdSeat(l.quotedTier.pricePerSeatCents)} a seat${l.quote && l.quote.perAccountFeeCents > 0 ? ` + ${usdSeat(l.quote.perAccountFeeCents)} per account` : ""}`;
    if (l.status === "failed") return "Call failed, no quote";
    if (l.status === "no_recording") return "No recording to replay";
    if (l.status === "extracted") return "No better offer";
    return running ? "Dials when a line frees up" : "Not called yet";
  };

  const stateText = (l: Lane): string => {
    if (l.status === "calling") return `Live ${fmtMmSs(elapsed(l))}`;
    if (l.status === "transcribing") return `Transcribing ${fmtMmSs(elapsed(l))}`;
    if (l.status === "waiting") return running ? "Queued" : "Not called";
    if (l.status === "failed") return "Call failed";
    if (l.status === "no_recording") return "No recording";
    return l.eligible ? "Quoted" : "No better offer";
  };

  const joined = joinedId ? (lanes.find((l) => l.vendor.id === joinedId) ?? null) : null;

  if (joined) {
    return (
      <JoinedView
        lane={joined}
        others={lanes.filter((l) => l.vendor.id !== joined.vendor.id)}
        elapsedMs={elapsed(joined)}
        offer={offerText(joined)}
        stateOf={stateText}
        onJoin={onJoin}
      />
    );
  }

  const live = lanes.filter(isLive);
  const rows = rankLanes(lanes.filter((l) => !isLive(l)));

  return (
    <>
      {live.length > 0 && (
        <section aria-label="Live calls" className="grid gap-4" style={{ gridTemplateColumns: `repeat(${live.length}, minmax(0, 1fr))` }}>
          {live.map((l) => (
            <LiveTile key={l.vendor.id} lane={l} state={stateText(l)} offer={offerText(l)} onJoin={() => onJoin(l.vendor.id)} />
          ))}
        </section>
      )}

      <section aria-label="Calls so far" className="flex flex-col">
        <div className="cw-cols grid gap-4 px-1 pb-2 text-[12px] font-medium text-muted">
          <span>Vendor</span>
          <span className="tabular text-right">List</span>
          <span className="tabular text-right">This pool</span>
          <span>Call</span>
        </div>
        {rows.length === 0 && <p className="border-t border-line px-1 py-3 text-[13px] text-muted">Every vendor is on a call right now.</p>}
        {rows.map((l) => {
          const queued = l.status === "waiting";
          const quote = l.quotedTier ? usdSeat(l.quotedTier.pricePerSeatCents) : isDone(l) ? "none" : "";
          const summary = queued
            ? running
              ? "Queued, dials when a line frees up"
              : "Not called yet"
            : l.status === "failed"
              ? `Call failed${l.call?.error ? `: ${l.call.error}` : ""}`
              : l.status === "no_recording"
                ? "No recording to replay"
                : `${fmtMmSs(elapsed(l))} call, ${callNote(l)}, open the replay`;
          return (
            <button
              key={l.vendor.id}
              type="button"
              className="cw-rowbtn cw-cols"
              onClick={() => onJoin(l.vendor.id)}
              disabled={!l.call}
              aria-label={`${queued ? "Queued call with" : "Open the replay of the call with"} ${l.vendor.name}`}
            >
              <span className={`text-[15px] font-medium ${queued ? "text-faint" : "text-ink"}`}>{l.vendor.name}</span>
              <span className="tabular text-right text-[14px] text-muted">{usdSeat(l.vendor.listPricePerSeatCents)}</span>
              <span className="tabular text-right text-[20px] font-semibold tracking-[-0.01em] text-ink">{quote}</span>
              <span className="tabular text-[13px] text-muted">{summary}</span>
            </button>
          );
        })}
      </section>
    </>
  );
}

function callNote(l: Lane): string {
  const q = l.quote;
  if (!q) return "no usable quote";
  if (q.separateAccountsConfirmed !== true) return "separate accounts not confirmed";
  if (!l.quotedTier) return "no current tier at this pool size";
  const fee = q.perAccountFeeCents > 0 ? `${usdSeat(q.perAccountFeeCents)} account fee` : "no account fee";
  return /each company.*10\+|10\+.*each company/i.test(q.conditions.join(" ")) ? `${fee}, 10+ seats per company` : fee;
}

function Meter({ className = "" }: { className?: string }) {
  return (
    <span className={`cw-meter ${className}`} aria-hidden>
      <span />
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}

function LiveDot({ size = 6 }: { size?: number }) {
  return <span className="cw-live inline-block shrink-0 rounded-full bg-accent" aria-hidden style={{ width: size, height: size }} />;
}

/** Turns with "new since this view mounted" flags, so motion happens only when a real turn arrives. */
function useNewTurns(callId: string | null, count: number) {
  const seen = useRef<{ callId: string | null; count: number }>({ callId, count });
  if (seen.current.callId !== callId) seen.current = { callId, count: 0 };
  const firstNew = seen.current.count;
  useEffect(() => {
    seen.current = { callId, count };
  }, [callId, count]);
  return firstNew;
}

function LiveTile({ lane, state, offer, onJoin }: { lane: Lane; state: string; offer: string; onJoin: () => void }) {
  const turns = lane.call?.transcriptTurns ?? [];
  const firstNew = useNewTurns(lane.call?.id ?? null, turns.length);
  const shown = turns.slice(-2);
  const offset = turns.length - shown.length;
  return (
    <button type="button" className="cw-tile cw-tile--live flex min-h-[300px] flex-col gap-4 px-6 py-[22px]" onClick={onJoin} aria-label={`Join the live call with ${lane.vendor.name}`}>
      <span className="flex w-full items-center justify-between gap-3">
        <span className="flex items-center gap-3">
          <span className="text-[20px] font-semibold tracking-[-0.01em]">{lane.vendor.name}</span>
          <span className="tabular inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-strong">
            <LiveDot />
            {state}
          </span>
        </span>
        <Meter />
      </span>
      <span className="flex w-full flex-1 flex-col justify-end gap-3">
        {shown.length === 0 ? (
          <span className="text-[14px] text-muted">
            {lane.status === "transcribing" ? "Call ended. Waiting for the transcript." : "Dialing. The first line appears when the call is transcribed."}
          </span>
        ) : (
          shown.map((t, i) => {
            const idx = offset + i;
            const last = i === shown.length - 1;
            const agent = isAgent(t.speaker);
            return (
              <span key={`${lane.call?.id}-${idx}`} className={`grid grid-cols-[110px_minmax(0,1fr)] items-baseline gap-3 ${idx >= firstNew ? "cw-turn-new" : ""}`}>
                <span className={`text-[12px] font-medium ${agent ? "text-accent-strong" : "text-muted"}`}>{agent ? "want-it agent" : lane.vendor.name}</span>
                <span className={`break-words leading-[1.4] ${last ? "text-[17px] text-ink" : "text-[14px] text-muted"}`}>{t.text}</span>
              </span>
            );
          })
        )}
      </span>
      <span className="flex w-full items-center justify-between gap-3 border-t border-canvas pt-3">
        <span className="tabular text-[13px] text-muted">{offer}</span>
        <span className="text-[13px] font-semibold text-accent-strong">Join the call</span>
      </span>
    </button>
  );
}

/** Which audio the joined view can play, and why not when it cannot. */
function audioFor(lane: Lane): { url: string | null; reason: string } {
  const c = lane.call;
  if (!c) return { url: null, reason: "No call to listen to yet" };
  const a = c.audio;
  if (isLive(lane)) {
    if (a?.liveUrl && (a.liveKind === "mp3" || a.liveKind === "hls" || a.liveKind === null)) return { url: a.liveUrl, reason: "" };
    if (a?.liveUrl) return { url: null, reason: `Live audio arrives as ${a.liveKind}, which this player cannot play yet` };
    return { url: null, reason: "Dial has not given a listen-in stream for this call" };
  }
  if (a?.recordingUrl) return { url: a.recordingUrl, reason: "" };
  if (c.source === "recorded_replay" || c.status === "extracted" || c.status === "transcribed" || c.status === "ended") {
    return { url: `/recordings/${lane.vendor.id}.m4a`, reason: "" };
  }
  return { url: null, reason: "No recording for this call" };
}

function useJoinedAudio(url: string | null, on: boolean) {
  const el = useRef<HTMLAudioElement | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
    if (el.current) {
      el.current.pause();
      el.current = null;
    }
    if (!url) return;
    const a = new Audio(url);
    a.preload = "auto";
    a.onerror = () => setFailed(true);
    el.current = a;
    return () => {
      a.pause();
      el.current = null;
    };
  }, [url]);
  useEffect(() => {
    const a = el.current;
    if (!a) return;
    if (on) void a.play().catch(() => setFailed(true));
    else a.pause();
  }, [on, url]);
  return failed;
}

function JoinedView({
  lane,
  others,
  elapsedMs,
  offer,
  stateOf,
  onJoin,
}: {
  lane: Lane;
  others: Lane[];
  elapsedMs: number;
  offer: string;
  stateOf: (l: Lane) => string;
  onJoin: (vendorId: string | null) => void;
}) {
  const live = isLive(lane);
  const turns = lane.call?.transcriptTurns ?? [];
  const firstNew = useNewTurns(lane.call?.id ?? null, turns.length);
  const audio = audioFor(lane);
  const [soundOn, setSoundOn] = useState(false);
  const audioFailed = useJoinedAudio(audio.url, soundOn);
  const canListen = !!audio.url && !audioFailed;
  useEffect(() => {
    if (!canListen) setSoundOn(false);
  }, [canListen]);
  const state = live ? stateOf(lane) : lane.call ? `Ended, ${fmtMmSs(elapsedMs)}` : stateOf(lane);
  const emptyText =
    lane.status === "failed"
      ? `Call failed${lane.call?.error ? `: ${lane.call.error}` : "."} No quote from this call.`
      : lane.status === "no_recording"
        ? "No recorded call exists for this vendor, so there is nothing to replay."
        : lane.status === "transcribing"
          ? "Call ended. Waiting for the transcript."
          : live
            ? "Dialing. Turns appear here as the call is transcribed."
            : "No transcript yet.";
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el && live) el.scrollTop = el.scrollHeight;
  }, [turns.length, live]);

  return (
    <section className="cw-view-in grid min-h-[600px] gap-5 lg:grid-cols-[minmax(0,1fr)_280px]" aria-label="Joined call">
      <div className="flex flex-col gap-[18px] rounded-[10px] border border-line bg-surface px-[26px] py-[22px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-3.5">
            <span className="text-[22px] font-semibold tracking-[-0.015em]">{lane.vendor.name}</span>
            <span className={`tabular inline-flex items-center gap-1.5 text-[13px] font-medium ${live ? "text-accent-strong" : "text-muted"}`}>
              {live && <LiveDot />}
              {state}
            </span>
            <span className="tabular text-[13px] text-muted">{offer}</span>
          </div>
          <div className="flex items-center gap-2">
            {live && <Meter className="mr-1.5" />}
            <button
              type="button"
              className={`cw-btn ${soundOn ? "cw-btn-on" : ""}`}
              disabled={!canListen}
              title={canListen ? (soundOn ? "Mute" : "Listen to this call") : audioFailed ? "The audio file could not be loaded" : audio.reason}
              aria-pressed={soundOn}
              onClick={() => setSoundOn((v) => !v)}
            >
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
                <path d="M2 6h3l4-3v10l-4-3H2z" />
                <path d="M11.5 5.5a3.5 3.5 0 0 1 0 5" />
              </svg>
              {soundOn ? "Sound on" : "Sound off"}
            </button>
            <button type="button" className="cw-btn" onClick={() => onJoin(null)}>
              All calls
            </button>
          </div>
        </div>
        <div ref={scroller} className="flex max-h-[62vh] flex-col gap-3.5 overflow-y-auto border-t border-canvas pt-4 [scrollbar-color:var(--color-line)_transparent] [scrollbar-width:thin]" aria-live="polite">
          {turns.length === 0 ? (
            <p className="m-0 text-[15px] text-muted">{emptyText}</p>
          ) : (
            turns.map((t, idx) => {
              const last = idx === turns.length - 1;
              const agent = isAgent(t.speaker);
              return (
                <p key={`${lane.call?.id}-${idx}`} className={`m-0 grid grid-cols-[120px_minmax(0,1fr)] items-baseline gap-3.5 ${idx >= firstNew ? "cw-turn-new" : ""}`}>
                  <span className={`text-[13px] font-medium ${agent ? "text-accent-strong" : "text-muted"}`}>{agent ? "want-it agent" : lane.vendor.name}</span>
                  <span className={`break-words leading-[1.45] ${last ? "text-[16px] text-ink" : "text-[14px] text-muted"}`}>{t.text}</span>
                </p>
              );
            })
          )}
        </div>
        <p className="tabular m-0 mt-auto border-t border-canvas pt-3 text-[12px] text-muted">
          {soundOn
            ? live
              ? "Listening to the live call. You are muted; only the agents speak."
              : "Playing the recording of this call."
            : canListen
              ? live
                ? "Sound is off. The transcript updates as the call goes on."
                : "Recorded call. Turn sound on to hear it."
              : live
                ? `Sound is off: ${audio.reason.toLowerCase()}. The transcript updates as the call goes on.`
                : "Recorded call. The transcript is the full record."}
        </p>
      </div>
      <aside aria-label="Other calls" className="flex flex-col self-start rounded-[10px] border border-line bg-surface px-4 py-1.5">
        {others.map((o) => (
          <button
            key={o.vendor.id}
            type="button"
            className="cw-rowbtn grid-cols-[minmax(0,1fr)_auto] px-0 py-3"
            onClick={() => onJoin(o.vendor.id)}
            disabled={!o.call}
            aria-label={`${isLive(o) ? "Join the live call with" : o.call ? "Open the call with" : "Queued call with"} ${o.vendor.name}`}
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="inline-flex items-center gap-1.5 text-[14px] font-medium">
                {isLive(o) && <LiveDot />}
                {o.vendor.name}
              </span>
              <span className="tabular text-[12px] text-muted">{stateOf(o)}</span>
            </span>
            <span className="tabular text-[18px] font-semibold text-ink">{o.eligible && o.eff ? usdSeat(o.eff.effectiveCents) : ""}</span>
          </button>
        ))}
      </aside>
    </section>
  );
}
