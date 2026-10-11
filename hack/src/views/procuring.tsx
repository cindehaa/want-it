import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { ArrowRight, Bot, Check, Loader2, Phone, PhoneOff, Terminal } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { isFinal, placeCall, pollCall, type LiveCall, type Turn } from "@/lib/dial"

type Step = {
  title: string
  detail: string
  logs: string[]
  duration?: number
  call?: boolean
}

const steps: Step[] = [
  {
    title: "Lock pool commitments",
    detail: "5 organizations · 25 units",
    duration: 2400,
    logs: [
      "pool.lock(POOL-2291)",
      "✓ Lumen Robotics signed commitment (6)",
      "✓ Kiez Ventures signed commitment (5)",
      "✓ Nordlicht Studio, Feldweg GmbH, you signed (14)",
    ],
  },
  {
    title: "Request dealer quotes",
    detail: "3 authorized Herman Miller dealers",
    duration: 2800,
    logs: [
      "rfq.send → 3 dealers in DE",
      "quote: Officeplus Hamburg — €1,412/unit, 4 wks",
      "quote: Design Möbel Köln — €1,389/unit, 5 wks",
      "quote: Büro Concept Berlin — €1,359/unit, 2 wks ★",
    ],
  },
  {
    title: "Negotiate by phone",
    detail: "Büro Concept Berlin",
    call: true,
    logs: ["voice.dial(Büro Concept Berlin) via Dial", "negotiating price & delivery window…"],
  },
  {
    title: "Issue purchase order",
    detail: "PO-2026-1147 · €33,225",
    duration: 2200,
    logs: ["po.generate(25 × Aeron B Graphite @ €1,329)", "✓ PO-2026-1147 sent to orders@buero-concept.example"],
  },
  {
    title: "Split payment via escrow",
    detail: "5 invoices generated",
    duration: 2200,
    logs: ["escrow.create(€33,225)", "✓ 5 member invoices issued, funds held until delivery"],
  },
  {
    title: "Schedule delivery",
    detail: "Nov 21 · 3 drop-offs in Berlin",
    duration: 2000,
    logs: ["logistics.book(3 stops, Berlin)", "✓ Delivery + assembly confirmed for Nov 21"],
  },
]

type Line = { who: "agent" | "dealer"; text: string }

const transcript: Line[] = [
  {
    who: "agent",
    text: "Hi Jonas, this is the Pooled procurement agent calling for five Berlin companies. I'd like to confirm stock for 25 Aeron chairs, size B, graphite.",
  },
  {
    who: "dealer",
    text: "Hi! Let me check… we have 18 in our Berlin warehouse, the other 7 come from Zeeland in about a week.",
  },
  {
    who: "agent",
    text: "That works if all 25 arrive by November 21st. Your quote was €1,359 — can you do €1,329 per chair for a single PO with prepayment?",
  },
  {
    who: "dealer",
    text: "For 25 units… €1,329 is fine. Assembly would be €25 extra per chair though.",
  },
  {
    who: "agent",
    text: "We'd commit today with funds already in escrow. Could you include assembly at that price?",
  },
  { who: "dealer", text: "Okay — deal. €1,329 all-in, delivered and assembled by the 21st." },
  { who: "agent", text: "Perfect, the purchase order will be in your inbox within a minute. Thanks, Jonas!" },
]

export function Procuring({ onDone }: { onDone: () => void }) {
  const [current, setCurrent] = useState(0)
  const [logs, setLogs] = useState<{ id: number; text: string }[]>([])
  const [callDone, setCallDone] = useState(false)
  const done = current >= steps.length
  const logId = useRef(0)

  // stream step logs + auto-advance timed steps
  useEffect(() => {
    if (done) return
    const step = steps[current]
    const span = step.duration ?? 1600
    const timers = step.logs.map((text, i) =>
      setTimeout(() => setLogs((l) => [...l, { id: logId.current++, text }]), (span / (step.logs.length + 1)) * i),
    )
    if (!step.call) timers.push(setTimeout(() => setCurrent((c) => c + 1), span))
    return () => timers.forEach(clearTimeout)
  }, [current, done])

  useEffect(() => {
    if (!callDone) return
    setLogs((l) => [...l, { id: logId.current++, text: "✓ call ended — see transcript for agreed terms" }])
    const t = setTimeout(() => setCurrent((c) => c + 1), 900)
    return () => clearTimeout(t)
  }, [callDone])

  const callState = steps[current]?.call ? "live" : callDone ? "ended" : "idle"

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          <img src="/images/aeron.jpg" alt="" className="size-20 rounded-2xl border bg-white object-cover shadow-sm" />
          <div>
          <Badge variant="outline" className="mb-2 gap-1.5">
            <span className={cn("size-1.5 rounded-full", done ? "bg-emerald-500" : "animate-pulse bg-indigo-500")} />
            {done ? "Finished" : "Agent working"}
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight">
            {done ? "Procurement complete" : "Procuring 25 × Aeron chairs"}
          </h1>
          <p className="text-muted-foreground">POOL-2291 · on behalf of 5 organizations</p>
          </div>
        </div>
        {done && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
            <Button
              size="lg"
              onClick={onDone}
              className="bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:opacity-90"
            >
              View order <ArrowRight />
            </Button>
          </motion.div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card className="gap-0 p-6">
          <ol className="relative space-y-1">
            {steps.map((s, i) => {
              const state = i < current ? "done" : i === current ? "active" : "pending"
              return (
                <li key={s.title} className="relative flex gap-4 pb-5 last:pb-0">
                  {i < steps.length - 1 && (
                    <span className="absolute top-8 bottom-0 left-[15px] w-px bg-border">
                      <motion.span
                        className="absolute inset-x-0 top-0 bg-emerald-500"
                        initial={{ height: 0 }}
                        animate={{ height: state === "done" ? "100%" : 0 }}
                      />
                    </span>
                  )}
                  <span
                    className={cn(
                      "relative z-10 grid size-8 shrink-0 place-items-center rounded-full border-2 bg-background transition-colors",
                      state === "done" && "border-emerald-500 bg-emerald-500 text-white",
                      state === "active" && "border-indigo-500 text-indigo-600",
                      state === "pending" && "text-muted-foreground",
                    )}
                  >
                    {state === "done" ? (
                      <Check className="size-4" />
                    ) : state === "active" ? (
                      s.call ? <Phone className="size-3.5 animate-pulse" /> : <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <span className="text-xs">{i + 1}</span>
                    )}
                  </span>
                  <div className={cn("pt-1", state === "pending" && "opacity-50")}>
                    <p className="font-medium">{s.title}</p>
                    <p className="text-sm text-muted-foreground">{s.detail}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        </Card>

        <div className="space-y-6">
          <PhoneCall state={callState} onEnded={() => setCallDone(true)} />
          <AgentLog logs={logs} working={!done} />
        </div>
      </div>
    </div>
  )
}

function AgentLog({ logs, working }: { logs: { id: number; text: string }[]; working: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" })
  }, [logs.length])
  return (
    <Card className="gap-0 overflow-hidden bg-zinc-950 p-0 text-zinc-100">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5 text-xs text-zinc-400">
        <Terminal className="size-3.5" /> agent.log
      </div>
      <div ref={ref} className="h-48 space-y-1 overflow-y-auto p-4 font-mono text-xs">
        {logs.map((l) => (
          <motion.p
            key={l.id}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            className={cn(l.text.startsWith("✓") ? "text-emerald-400" : "text-zinc-300")}
          >
            <span className="text-zinc-600">› </span>
            {l.text}
          </motion.p>
        ))}
        {working && <span className="inline-block h-3.5 w-2 animate-pulse bg-zinc-400" />}
      </div>
    </Card>
  )
}

function PhoneCall({ state, onEnded }: { state: "idle" | "live" | "ended"; onEnded: () => void }) {
  const [phase, setPhase] = useState<"ringing" | "talking" | "ended">("ringing")
  // live: one real Dial call via the backend. scripted: fallback when the call can't be placed (shown as simulated).
  const [mode, setMode] = useState<"connecting" | "live" | "scripted">("connecting")
  const [live, setLive] = useState<LiveCall | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [liveError, setLiveError] = useState<string | null>(null)
  const [line, setLine] = useState(0)
  const [chars, setChars] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const scroller = useRef<HTMLDivElement>(null)
  const ended = useRef(onEnded)
  useEffect(() => {
    ended.current = onEnded
  }, [onEnded])

  // place the real call as soon as the step goes live; fall back to the scripted call if that fails
  useEffect(() => {
    if (state !== "live") return
    let cancelled = false
    placeCall()
      .then((c) => {
        if (cancelled) return
        setLive(c)
        setMode("live")
      })
      .catch((e: Error) => {
        if (cancelled) return
        setLiveError(e.message)
        setMode("scripted")
      })
    return () => {
      cancelled = true
    }
  }, [state])

  // live: poll Dial through the backend until the call is final
  useEffect(() => {
    if (mode !== "live" || !live || phase === "ended") return
    let stop = false
    const tick = async () => {
      try {
        const v = await pollCall(live.dialCallId)
        if (stop) return
        if (v.transcriptTurns.length > 0) setTurns(v.transcriptTurns)
        if (v.status === "in_progress" || v.transcriptTurns.length > 0) setPhase((p) => (p === "ringing" ? "talking" : p))
        if (isFinal(v.status)) {
          if (v.status === "failed") setLiveError(v.error ?? "The call failed.")
          if (v.durationSeconds != null) setSeconds(Math.round(v.durationSeconds))
          setPhase("ended")
          ended.current()
        }
      } catch (e) {
        if (!stop) setLiveError((e as Error).message)
      }
    }
    void tick()
    const t = setInterval(tick, 2000)
    return () => {
      stop = true
      clearInterval(t)
    }
  }, [mode, live, phase])

  // scripted: ring, then pick up
  useEffect(() => {
    if (state !== "live" || mode !== "scripted") return
    const t = setTimeout(() => setPhase("talking"), 2400)
    return () => clearTimeout(t)
  }, [state, mode])

  // call timer (real seconds for the live call)
  useEffect(() => {
    if (phase !== "talking") return
    const t = setInterval(() => setSeconds((s) => s + 1), mode === "live" ? 1000 : 280)
    return () => clearInterval(t)
  }, [phase, mode])

  // scripted: typewriter through the transcript
  useEffect(() => {
    if (mode !== "scripted" || phase !== "talking") return
    if (line >= transcript.length) {
      const t = setTimeout(() => {
        setPhase("ended")
        ended.current()
      }, 900)
      return () => clearTimeout(t)
    }
    const text = transcript[line].text
    if (chars < text.length) {
      const t = setTimeout(() => setChars((c) => Math.min(text.length, c + 2)), 24)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => {
      setLine((l) => l + 1)
      setChars(0)
    }, 650)
    return () => clearTimeout(t)
  }, [mode, phase, line, chars])

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
  }, [line, chars, turns.length])

  // what's on screen: real Dial turns, or the scripted lines being typed
  const shown: { who: "agent" | "dealer"; text: string; typing: boolean }[] =
    mode === "live"
      ? turns.map((t) => ({ who: t.speaker === "agent" ? "agent" : "dealer", text: t.text, typing: false }))
      : phase === "ringing"
        ? []
        : transcript.slice(0, Math.min(line + 1, transcript.length)).map((l, i) => ({ who: l.who, text: i === line ? l.text.slice(0, chars) : l.text, typing: i === line && phase === "talking" }))
  const speaking = phase === "talking" && shown.length > 0 ? shown[shown.length - 1].who : null
  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
  const failed = phase === "ended" && mode === "live" && !!liveError && turns.length === 0

  if (state === "idle") {
    return (
      <Card className="flex-row items-center gap-3 border-dashed p-5 text-sm text-muted-foreground">
        <Phone className="size-4" /> Agent will call the dealer once quotes are in.
      </Card>
    )
  }

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="relative flex items-center gap-4 overflow-hidden bg-gradient-to-br from-zinc-900 via-indigo-950 to-violet-950 p-5 text-white">
        <div className="relative">
          <div className="grid size-12 place-items-center rounded-full bg-white/10 text-sm font-semibold">BC</div>
          {phase === "ringing" && (
            <>
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/40" />
              <span className="absolute -inset-2 animate-ping rounded-full bg-emerald-400/20 [animation-delay:300ms]" />
            </>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium">Büro Concept Berlin</p>
          <p className="truncate text-sm text-white/60">Jonas Weber · {live?.to ?? "+49 30 5550 1842"}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="font-mono text-sm tabular-nums">
            {phase === "ringing" ? (mode === "connecting" ? "Dialing…" : "Ringing…") : phase === "ended" ? `Ended ${mmss}` : mmss}
          </span>
          {phase === "ended" ? (
            failed ? <Badge className="bg-red-500 text-white">Call failed</Badge> : <Badge className="bg-emerald-500 text-white">Call complete</Badge>
          ) : (
            <span className="grid size-8 place-items-center rounded-full bg-red-500">
              <PhoneOff className="size-4" />
            </span>
          )}
        </div>
      </div>

      {phase !== "ringing" && (
        <div className="flex items-center gap-6 border-b px-5 py-3">
          <Waveform active={speaking === "agent"} label="Agent" color="bg-indigo-500" />
          <Waveform active={speaking === "dealer"} label="Jonas" color="bg-emerald-500" />
          <Badge variant="outline" className="ml-auto gap-1.5 text-[10px]">
            <span className={cn("size-1.5 rounded-full", mode === "live" ? "bg-emerald-500" : "bg-amber-500")} />
            {mode === "live" ? "Live call via Dial" : "Simulated call"}
          </Badge>
        </div>
      )}

      {liveError && (
        <p className="border-b bg-amber-50 px-5 py-2 text-xs text-amber-900">
          {mode === "scripted" ? "Couldn't place a real call, showing the scripted one: " : ""}
          {liveError}
        </p>
      )}

      <div ref={scroller} className="max-h-72 space-y-3 overflow-y-auto p-5">
        {phase === "ringing" && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> {mode === "live" ? "Calling the dealer via Dial…" : "Dialing authorized dealer…"}
          </p>
        )}
        {phase === "talking" && shown.length === 0 && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Connected, waiting for the transcript…
          </p>
        )}
        <AnimatePresence initial={false}>
          {shown.map((l, i) => {
            const agent = l.who === "agent"
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn("flex gap-2", agent ? "" : "flex-row-reverse")}
              >
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full text-[10px] font-semibold text-white",
                    agent ? "bg-gradient-to-br from-indigo-500 to-violet-600" : "bg-emerald-600",
                  )}
                >
                  {agent ? <Bot className="size-3.5" /> : "JW"}
                </span>
                <p
                  className={cn(
                    "max-w-[80%] whitespace-pre-line rounded-2xl px-3.5 py-2 text-sm",
                    agent ? "rounded-tl-sm bg-muted" : "rounded-tr-sm bg-emerald-50 text-emerald-950",
                  )}
                >
                  {l.text}
                  {l.typing && <span className="ml-0.5 inline-block h-3.5 w-1 animate-pulse bg-current align-middle" />}
                </p>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </Card>
  )
}

function Waveform({ active, label, color }: { active: boolean; label: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-6 items-center gap-0.5">
        {Array.from({ length: 14 }, (_, i) => (
          <motion.span
            key={i}
            className={cn("w-1 rounded-full", active ? color : "bg-muted-foreground/30")}
            animate={active ? { height: [4, 6 + ((i * 7) % 18), 4] } : { height: 4 }}
            transition={active ? { repeat: Infinity, duration: 0.5 + (i % 4) * 0.12, ease: "easeInOut" } : { duration: 0.2 }}
          />
        ))}
      </div>
      <span className={cn("text-xs", active ? "font-medium" : "text-muted-foreground")}>{label}</span>
    </div>
  )
}
