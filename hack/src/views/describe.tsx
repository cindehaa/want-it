import { useEffect, useRef, useState } from "react"
import { motion } from "motion/react"
import { ArrowLeft, ArrowRight, Bot, Paperclip, Sparkles, Wand2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { defaultRequest } from "@/data"

const examples = [
  { label: "8 Aeron chairs for our Berlin office", text: defaultRequest },
]

export function Describe({
  value,
  onChange,
  onSubmit,
  onBack,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  onBack: () => void
}) {
  const [typing, setTyping] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearInterval(timer.current), [])

  const typeOut = (text: string) => {
    window.clearInterval(timer.current)
    setTyping(true)
    let i = 0
    timer.current = window.setInterval(() => {
      i += 2
      onChange(text.slice(0, i))
      if (i >= text.length) {
        window.clearInterval(timer.current)
        setTyping(false)
      }
    }, 18)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 py-6">
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 text-muted-foreground">
        <ArrowLeft /> Marketplace
      </Button>

      <div className="space-y-3 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="mx-auto grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30"
        >
          <Bot className="size-7" />
        </motion.div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">What do you need to buy?</h1>
        <p className="text-muted-foreground">
          Describe it like you'd tell a colleague. The agent figures out the specs, finds a pool and buys it.
        </p>
      </div>

      <Card className="relative gap-0 overflow-hidden p-0 shadow-xl shadow-indigo-500/5 focus-within:ring-2 focus-within:ring-indigo-500/30">
        <Textarea
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && value.trim()) onSubmit()
          }}
          placeholder="e.g. We need 8 ergonomic chairs for our new office, delivered before December…"
          className="min-h-40 resize-none border-0 p-5 text-base shadow-none focus-visible:ring-0 md:text-base"
        />
        <div className="flex items-center justify-between border-t bg-muted/40 px-3 py-2.5">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="Attach">
              <Paperclip />
            </Button>
            <Badge variant="outline" className="gap-1 bg-background">
              <Sparkles className="size-3 text-violet-500" /> Agent mode
            </Badge>
          </div>
          <Button
            onClick={onSubmit}
            disabled={!value.trim() || typing}
            className="bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:opacity-90"
          >
            Find the best deal <ArrowRight />
          </Button>
        </div>
      </Card>

      <div className="space-y-3">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Wand2 className="size-3.5" /> Try an example
        </p>
        <div className="flex flex-wrap gap-2">
          {examples.map((e) => (
            <Button
              key={e.label}
              variant="outline"
              className="h-auto rounded-full py-1 pr-4 pl-1"
              onClick={() => typeOut(e.text)}
            >
              <img src="/images/aeron.jpg" alt="" className="size-8 rounded-full border object-cover" />
              {e.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
