import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Armchair, Brain, Check, GitMerge, Loader2, MapPin, Radar, Users, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ProductArt } from "@/components/product-art"
import { cn } from "@/lib/utils"
import { aeron, candidates, eur, myUnits, parsedSpec, poolMembers } from "@/data"

type Phase = "parsing" | "searching" | "found" | "merging"

export function Matching({ request, onMerged }: { request: string; onMerged: () => void }) {
  const [phase, setPhase] = useState<Phase>("parsing")
  const [specShown, setSpecShown] = useState(0)
  const [scanned, setScanned] = useState(0)
  const [poolCount, setPoolCount] = useState(0)

  // parsing: reveal spec fields one by one
  useEffect(() => {
    if (phase !== "parsing") return
    if (specShown < parsedSpec.length) {
      const t = setTimeout(() => setSpecShown((n) => n + 1), 380)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setPhase("searching"), 900)
    return () => clearTimeout(t)
  }, [phase, specShown])

  // searching: stream candidates in, tick a fake pool counter
  useEffect(() => {
    if (phase !== "searching") return
    const counter = setInterval(() => setPoolCount((n) => Math.min(2418, n + 31)), 60)
    return () => clearInterval(counter)
  }, [phase])

  useEffect(() => {
    if (phase !== "searching") return
    if (scanned < candidates.length) {
      const t = setTimeout(() => setScanned((n) => n + 1), 900)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setPhase("found"), 1300)
    return () => clearTimeout(t)
  }, [phase, scanned])

  useEffect(() => {
    if (phase !== "merging") return
    const t = setTimeout(onMerged, 2200)
    return () => clearTimeout(t)
  }, [phase, onMerged])

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Card className="gap-3 bg-muted/30 p-5">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Your request</p>
        <p className="text-base leading-relaxed">“{request || "Aeron chairs for the Berlin office"}”</p>
      </Card>

      <AnimatePresence mode="wait">
        {(phase === "parsing" || phase === "searching") && (
          <motion.div
            key="search"
            exit={{ opacity: 0, scale: 0.98 }}
            className="grid gap-6 lg:grid-cols-[1fr_1.3fr]"
          >
            <Card className="gap-4 p-6">
              <div className="flex items-center gap-2 font-medium">
                {specShown < parsedSpec.length ? (
                  <Loader2 className="size-4 animate-spin text-indigo-500" />
                ) : (
                  <Brain className="size-4 text-indigo-500" />
                )}
                Understanding request
              </div>
              <AnimatePresence>
                {specShown > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="flex items-center gap-3 overflow-hidden rounded-xl border bg-muted/30 p-2"
                  >
                    <img src={aeron.image} alt="" className="size-14 rounded-lg bg-white object-cover" />
                    <div className="text-sm">
                      <p className="font-medium">Identified product</p>
                      <p className="text-muted-foreground">Herman Miller Aeron · 98% confidence</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="space-y-2">
                {parsedSpec.map((s, i) => (
                  <div key={s.label} className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2 text-sm">
                    <span className="text-muted-foreground">{s.label}</span>
                    {i < specShown ? (
                      <motion.span
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="text-right font-medium"
                      >
                        {s.value}
                      </motion.span>
                    ) : (
                      <span className="h-4 w-28 animate-pulse rounded bg-muted" />
                    )}
                  </div>
                ))}
              </div>
            </Card>

            <Card className="relative gap-4 overflow-hidden p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-medium">
                  <Radar className={cn("size-4 text-violet-500", phase === "searching" && "animate-pulse")} />
                  Finding a pool to merge with
                </div>
                <Badge variant="secondary" className="tabular-nums">
                  {poolCount.toLocaleString("en")} pools scanned
                </Badge>
              </div>

              {phase === "parsing" ? (
                <div className="grid flex-1 place-items-center py-16 text-sm text-muted-foreground">
                  Waiting for spec…
                </div>
              ) : (
                <div className="grid gap-6 sm:grid-cols-[180px_1fr]">
                  <RadarSweep hits={scanned} />
                  <div className="space-y-2">
                    {candidates.slice(0, scanned).map((c) => (
                      <motion.div
                        key={c.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn(
                          "space-y-1.5 rounded-lg border px-3 py-2 text-sm",
                          c.match ? "border-emerald-500/50 bg-emerald-50" : "opacity-60",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          {c.image ? (
                            <img src={c.image} alt="" className="size-8 shrink-0 rounded-md object-cover" />
                          ) : (
                            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted">
                              <Armchair className="size-4 text-muted-foreground" />
                            </span>
                          )}
                          <span className="flex-1 truncate font-medium">{c.title}</span>
                          {c.match ? (
                            <Check className="size-4 shrink-0 text-emerald-600" />
                          ) : (
                            <X className="size-4 shrink-0 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${c.score}%` }}
                              transition={{ duration: 0.6 }}
                              className={cn("h-full", c.match ? "bg-emerald-500" : "bg-zinc-400")}
                            />
                          </div>
                          <span className="w-8 text-right text-xs tabular-nums">{c.score}%</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {c.id} · {c.detail} · {c.reason}
                        </p>
                      </motion.div>
                    ))}
                    {scanned < candidates.length && (
                      <div className="flex items-center gap-2 px-1 py-2 text-xs text-muted-foreground">
                        <Loader2 className="size-3 animate-spin" /> Evaluating candidates…
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Card>
          </motion.div>
        )}

        {(phase === "found" || phase === "merging") && (
          <motion.div key="found" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <MatchCard merging={phase === "merging"} onMerge={() => setPhase("merging")} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function RadarSweep({ hits }: { hits: number }) {
  const dots = [
    { x: 30, y: 28 },
    { x: 70, y: 35 },
    { x: 62, y: 70 },
    { x: 42, y: 60 },
    { x: 22, y: 68 },
  ]
  return (
    <div className="relative mx-auto aspect-square w-44 overflow-hidden rounded-full border border-violet-500/30 bg-gradient-to-br from-violet-950 to-indigo-950">
      {[1, 2, 3].map((r) => (
        <div
          key={r}
          className="absolute rounded-full border border-violet-400/20"
          style={{ inset: `${r * 14}%` }}
        />
      ))}
      <div className="absolute inset-x-0 top-1/2 h-px bg-violet-400/20" />
      <div className="absolute inset-y-0 left-1/2 w-px bg-violet-400/20" />
      <motion.div
        className="absolute inset-0"
        style={{
          background: "conic-gradient(from 0deg, rgba(167,139,250,0.55), transparent 25%)",
        }}
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
      />
      {dots.slice(0, hits).map((d, i) => {
        const match = candidates[i]?.match
        return (
          <motion.span
            key={i}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className={cn(
              "absolute size-2.5 -translate-1/2 rounded-full",
              match ? "bg-emerald-400 shadow-[0_0_12px_4px_rgba(52,211,153,0.7)]" : "bg-violet-300/70",
            )}
            style={{ left: `${d.x}%`, top: `${d.y}%` }}
          >
            {match && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400" />}
          </motion.span>
        )
      })}
    </div>
  )
}

function Gallery() {
  const images = aeron.gallery ?? [aeron.image]
  const [active, setActive] = useState(0)
  return (
    <div className="space-y-2">
      <AnimatePresence mode="wait">
        <motion.div key={active} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <ProductArt product={aeron} src={images[active]} className="aspect-square rounded-2xl border" />
        </motion.div>
      </AnimatePresence>
      <div className="grid grid-cols-3 gap-2">
        {images.map((src, i) => (
          <button
            key={src}
            onClick={() => setActive(i)}
            className={cn(
              "overflow-hidden rounded-lg border-2 transition",
              i === active ? "border-indigo-500" : "border-transparent opacity-70 hover:opacity-100",
            )}
          >
            <img src={src} alt="" className="aspect-square w-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  )
}

function MatchCard({ merging, onMerge }: { merging: boolean; onMerge: () => void }) {
  const committed = aeron.pool.committed
  const threshold = aeron.pool.threshold
  return (
    <Card className="gap-0 overflow-hidden p-0 shadow-xl">
      <div className="flex items-center gap-2 border-b bg-emerald-50 px-6 py-3 text-sm font-medium text-emerald-800">
        <Check className="size-4" /> Best match found · 97% spec overlap
      </div>
      <CardContent className="grid gap-8 p-6 md:grid-cols-[220px_1fr]">
        <Gallery />
        <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">POOL-2291 · Herman Miller Aeron</p>
              <h2 className="text-2xl font-semibold tracking-tight">Size B · Graphite · PostureFit SL</h2>
              <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="size-3.5" /> Delivery hub Berlin · closes in 3 days
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Price at threshold</p>
              <p className="text-2xl font-semibold text-emerald-600">{eur(aeron.poolPrice)}</p>
              <p className="text-sm text-muted-foreground line-through">{eur(aeron.listPrice)}</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Pool progress</span>
              <span className="tabular-nums text-muted-foreground">
                {merging ? threshold : committed} / {threshold} units
              </span>
            </div>
            <div className="relative flex h-8 overflow-hidden rounded-lg bg-muted">
              {poolMembers.map((m) => (
                <div
                  key={m.name}
                  className={cn("h-full border-r border-white/50", m.color)}
                  style={{ width: `${(m.units / threshold) * 100}%` }}
                />
              ))}
              <motion.div
                className={cn(
                  "flex h-full items-center justify-center rounded-r-lg text-xs font-semibold",
                  merging
                    ? "bg-gradient-to-r from-indigo-500 to-violet-600 text-white"
                    : "border-2 border-dashed border-indigo-400 bg-indigo-500/10 text-indigo-700",
                )}
                initial={false}
                animate={merging ? { scaleX: [0.2, 1.06, 1] } : { scaleX: 1 }}
                transition={{ duration: 0.8 }}
                style={{ width: `${(myUnits / threshold) * 100}%`, originX: 0 }}
              >
                +{myUnits} you
              </motion.div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
              {poolMembers.map((m) => (
                <span key={m.name} className="flex items-center gap-1.5">
                  <span className={cn("size-2 rounded-full", m.color)} />
                  {m.name} · {m.units}
                </span>
              ))}
              <span className="flex items-center gap-1.5 font-medium text-indigo-600">
                <span className="size-2 rounded-full bg-indigo-500" /> You · {myUnits}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-dashed p-4">
            <p className="flex items-center gap-2 text-sm">
              <Users className="size-4 text-indigo-500" />
              Your 8 units close the gap exactly. Merging unlocks Tier&nbsp;2 pricing for everyone.
            </p>
            <Button
              size="lg"
              disabled={merging}
              onClick={onMerge}
              className="bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:opacity-90"
            >
              {merging ? (
                <>
                  <Loader2 className="animate-spin" /> Merging…
                </>
              ) : (
                <>
                  <GitMerge /> Merge into pool
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
