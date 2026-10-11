import { useEffect, useState } from "react"
import { animate, motion } from "motion/react"
import { Bot, PartyPopper, TrendingDown } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { aeron, eur, myUnits, poolMembers, priceTiers } from "@/data"

const confettiColors = ["#6366f1", "#8b5cf6", "#10b981", "#f59e0b", "#ec4899", "#0ea5e9"]

export function Threshold({ onProcure }: { onProcure: () => void }) {
  const { committed, threshold } = aeron.pool
  const [count, setCount] = useState(committed)
  const [reached, setReached] = useState(false)

  useEffect(() => {
    const c = animate(committed, threshold, {
      duration: 1.6,
      delay: 0.4,
      ease: "easeOut",
      onUpdate: (v) => setCount(Math.round(v)),
      onComplete: () => setReached(true),
    })
    return () => c.stop()
  }, [committed, threshold])

  const pct = count / threshold
  const r = 88
  const circ = 2 * Math.PI * r
  const savingsPerUnit = aeron.listPrice - aeron.poolPrice

  return (
    <div className="relative mx-auto max-w-4xl space-y-8 py-4">
      {reached && <Confetti />}

      <div className="flex flex-col items-center gap-6 text-center">
        <div className="relative size-56">
          <svg viewBox="0 0 200 200" className="size-full -rotate-90">
            <circle cx="100" cy="100" r={r} fill="none" stroke="currentColor" strokeWidth="12" className="text-muted" />
            <circle
              cx="100"
              cy="100"
              r={r}
              fill="none"
              stroke="url(#g)"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={circ * (1 - pct)}
            />
            <defs>
              <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="100%" stopColor={reached ? "#10b981" : "#8b5cf6"} />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-5xl font-semibold tabular-nums">{count}</span>
            <span className="text-sm text-muted-foreground">of {threshold} units</span>
          </div>
          {reached && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", bounce: 0.6 }}
              className="absolute -top-1 -right-1 grid size-14 place-items-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/40"
            >
              <PartyPopper className="size-6" />
            </motion.div>
          )}
        </div>

        <div className="space-y-2">
          <Badge
            className={cn(
              "transition-colors",
              reached ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground",
            )}
          >
            {reached ? "Threshold reached" : "Merging orders…"}
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {reached ? "The pool is ready to order." : "Adding your 8 chairs to POOL-2291"}
          </h1>
          <div className="mx-auto mt-3 flex w-fit items-center gap-3 rounded-full border bg-background py-1 pr-4 pl-1 text-sm shadow-sm">
            <img src={aeron.image} alt="" className="size-9 rounded-full border object-cover" />
            <span className="text-muted-foreground">
              5 companies · {threshold} Aeron chairs · Tier 2 pricing unlocked
            </span>
          </div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={reached ? { opacity: 1, y: 0 } : {}}
        className="grid gap-4 md:grid-cols-3"
      >
        <Card className="gap-3 p-5 md:col-span-2">
          <p className="text-sm font-medium">Price tiers</p>
          <div className="space-y-2">
            {priceTiers.map((t) => {
              const active = t.min === threshold
              return (
                <div
                  key={t.label}
                  className={cn(
                    "flex items-center justify-between rounded-lg border px-3 py-2 text-sm",
                    active && "border-emerald-500/50 bg-emerald-50 font-medium",
                  )}
                >
                  <span>
                    {t.label} <span className="text-muted-foreground">· {t.min}+ units</span>
                  </span>
                  <span className={cn(active && "text-emerald-700")}>{eur(t.price)}</span>
                </div>
              )
            })}
          </div>
        </Card>
        <Card className="gap-1 bg-gradient-to-br from-emerald-500 to-teal-600 p-5 text-white">
          <TrendingDown className="size-5 opacity-80" />
          <p className="mt-2 text-sm opacity-90">You save</p>
          <p className="text-3xl font-semibold">{eur(savingsPerUnit * myUnits)}</p>
          <p className="text-sm opacity-90">
            {eur(savingsPerUnit)} per chair · {Math.round((savingsPerUnit / aeron.listPrice) * 100)}% off list
          </p>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={reached ? { opacity: 1 } : {}}
        transition={{ delay: 0.3 }}
        className="flex flex-col items-center gap-4"
      >
        <div className="flex -space-x-2">
          {[...poolMembers.map((m) => ({ ...m, initials: m.name.split(" ").map((w) => w[0]).join("") })), { name: "You", color: "bg-indigo-600", initials: "You", units: myUnits }].map((m) => (
            <span
              key={m.name}
              title={m.name}
              className={cn("grid size-10 place-items-center rounded-full border-2 border-background text-xs font-semibold text-white", m.color)}
            >
              {m.initials}
            </span>
          ))}
        </div>
        <Button
          size="lg"
          disabled={!reached}
          onClick={onProcure}
          className="h-12 bg-gradient-to-r from-indigo-500 to-violet-600 px-8 text-base text-white shadow-lg shadow-indigo-500/25 hover:opacity-90"
        >
          <Bot /> Let the agent procure
        </Button>
      </motion.div>
    </div>
  )
}

function Confetti() {
  const pieces = Array.from({ length: 60 }, (_, i) => i)
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.map((i) => {
        const left = (i * 37) % 100
        const delay = (i % 10) * 0.05
        const rotate = (i * 47) % 360
        return (
          <motion.span
            key={i}
            className="absolute top-0 h-3 w-1.5 rounded-sm"
            style={{ left: `${left}%`, background: confettiColors[i % confettiColors.length] }}
            initial={{ y: -20, opacity: 1, rotate }}
            animate={{ y: "100vh", opacity: 0, rotate: rotate + 540, x: ((i % 7) - 3) * 30 }}
            transition={{ duration: 2.2 + (i % 5) * 0.3, delay, ease: "easeIn" }}
          />
        )
      })}
    </div>
  )
}
