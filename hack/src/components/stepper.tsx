import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import type { View } from "@/App"

const steps: { label: string; views: View[] }[] = [
  { label: "Describe", views: ["describe"] },
  { label: "Match", views: ["matching"] },
  { label: "Pool", views: ["threshold"] },
  { label: "Procure", views: ["procuring"] },
  { label: "Done", views: ["complete"] },
]

export function Stepper({ view }: { view: View }) {
  const current = steps.findIndex((s) => s.views.includes(view))
  return (
    <ol className="flex items-center gap-2 text-xs">
      {steps.map((s, i) => {
        const done = i < current || view === "complete"
        const active = i === current && view !== "complete"
        return (
          <li key={s.label} className="flex items-center gap-2">
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium transition-colors",
                done && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
                active && "border-indigo-500/40 bg-indigo-500/10 text-indigo-700",
                !done && !active && "text-muted-foreground",
              )}
            >
              {done ? (
                <Check className="size-3" />
              ) : (
                <span className="tabular-nums">{i + 1}</span>
              )}
              {s.label}
            </span>
            {i < steps.length - 1 && <span className="h-px w-4 bg-border" />}
          </li>
        )
      })}
    </ol>
  )
}
