import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Boxes, ShoppingCart, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Stepper } from "@/components/stepper"
import { Marketplace } from "@/views/marketplace"
import { Describe } from "@/views/describe"
import { Matching } from "@/views/matching"
import { Threshold } from "@/views/threshold"
import { Procuring } from "@/views/procuring"
import { Complete } from "@/views/complete"

export type View =
  | "marketplace"
  | "describe"
  | "matching"
  | "threshold"
  | "procuring"
  | "complete"

export default function App() {
  const [view, setView] = useState<View>("marketplace")
  const [request, setRequest] = useState("")

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [view])

  const startProcure = (prefill?: string) => {
    setRequest(prefill ?? "")
    setView("describe")
  }

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <button
            onClick={() => setView("marketplace")}
            className="flex items-center gap-2 font-semibold tracking-tight"
          >
            <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
              <Boxes className="size-4" />
            </span>
            <span className="text-lg">Pooled</span>
          </button>
          <div className="hidden flex-1 justify-center md:flex">
            {view !== "marketplace" && <Stepper view={view} />}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" aria-label="Cart">
              <ShoppingCart />
            </Button>
            {view === "marketplace" && (
              <Button
                onClick={() => startProcure()}
                className="bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/20 hover:opacity-90"
              >
                <Sparkles /> Procure
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
          >
            {view === "marketplace" && <Marketplace onProcure={startProcure} />}
            {view === "describe" && (
              <Describe
                value={request}
                onChange={setRequest}
                onSubmit={() => setView("matching")}
                onBack={() => setView("marketplace")}
              />
            )}
            {view === "matching" && (
              <Matching request={request} onMerged={() => setView("threshold")} />
            )}
            {view === "threshold" && (
              <Threshold onProcure={() => setView("procuring")} />
            )}
            {view === "procuring" && (
              <Procuring onDone={() => setView("complete")} />
            )}
            {view === "complete" && (
              <Complete onHome={() => setView("marketplace")} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}
