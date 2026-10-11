import { motion } from "motion/react"
import { Calendar, Check, Download, FileText, Package, Phone, Truck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { ProductArt } from "@/components/product-art"
import { aeron, eur, myUnits } from "@/data"

export function Complete({ onHome }: { onHome: () => void }) {
  const subtotal = aeron.poolPrice * myUnits
  const saved = (aeron.listPrice - aeron.poolPrice) * myUnits

  return (
    <div className="mx-auto max-w-3xl space-y-8 py-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <motion.div
          initial={{ scale: 0, rotate: -45 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", bounce: 0.5 }}
          className="relative grid size-20 place-items-center rounded-full bg-emerald-500 text-white shadow-xl shadow-emerald-500/30"
        >
          <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/30 [animation-iteration-count:2]" />
          <Check className="relative size-10" strokeWidth={3} />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <h1 className="text-4xl font-semibold tracking-tight">Order complete</h1>
          <p className="mt-2 text-muted-foreground">
            Your agent pooled, negotiated and ordered everything. Chairs arrive <b className="text-foreground">Nov 21</b>.
          </p>
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
        <Card className="gap-0 overflow-hidden p-0">
          <div className="flex items-center justify-between border-b bg-muted/40 px-6 py-3 text-sm">
            <span className="font-medium">PO-2026-1147</span>
            <span className="text-muted-foreground">via POOL-2291 · Büro Concept Berlin</span>
          </div>
          <div className="flex gap-5 p-6">
            <ProductArt product={aeron} className="size-24 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-1">
              <p className="font-semibold">Herman Miller Aeron</p>
              <p className="text-sm text-muted-foreground">Size B · Graphite · PostureFit SL · assembled</p>
              <p className="text-sm">
                {myUnits} × {eur(aeron.poolPrice)}{" "}
                <span className="text-muted-foreground line-through">{eur(aeron.listPrice)}</span>
              </p>
            </div>
            <p className="text-lg font-semibold">{eur(subtotal)}</p>
          </div>
          <Separator />
          <div className="space-y-2 px-6 py-4 text-sm">
            <Row label="Delivery & assembly" value="Included" />
            <Row label="Pooled savings" value={`−${eur(saved)}`} accent />
            <Separator className="my-2" />
            <Row label="Total (held in escrow)" value={eur(subtotal)} bold />
          </div>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="grid gap-3 sm:grid-cols-2"
      >
        {[
          { icon: Phone, title: "Negotiated by phone", text: "Assembly included for free" },
          { icon: FileText, title: "PO issued", text: "Sent to dealer, confirmed" },
          { icon: Package, title: "Stock reserved", text: "18 Berlin · 7 from Zeeland" },
          { icon: Truck, title: "Delivery booked", text: "Nov 21 · Berlin-Mitte" },
        ].map((x) => (
          <Card key={x.title} className="flex-row items-center gap-3 p-4">
            <span className="grid size-9 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
              <x.icon className="size-4" />
            </span>
            <div>
              <p className="text-sm font-medium">{x.title}</p>
              <p className="text-xs text-muted-foreground">{x.text}</p>
            </div>
          </Card>
        ))}
      </motion.div>

      <div className="flex flex-wrap justify-center gap-3">
        <Button variant="outline">
          <Download /> Invoice
        </Button>
        <Button variant="outline">
          <Calendar /> Add delivery to calendar
        </Button>
        <Button onClick={onHome}>Back to marketplace</Button>
      </div>
    </div>
  )
}

function Row({ label, value, accent, bold }: { label: string; value: string; accent?: boolean; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={bold ? "font-medium" : "text-muted-foreground"}>{label}</span>
      <span className={accent ? "font-medium text-emerald-600" : bold ? "text-base font-semibold" : ""}>{value}</span>
    </div>
  )
}
