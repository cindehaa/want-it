import { motion } from "motion/react"
import { Search, Sparkles, TrendingDown, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { ProductArt } from "@/components/product-art"
import { defaultRequest, eur, products } from "@/data"

const categories = ["All", "Seating", "Desks", "Displays", "Laptops", "Peripherals", "Audio", "Lighting", "Office"]

export function Marketplace({ onProcure }: { onProcure: (prefill?: string) => void }) {
  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-8 sm:p-12">
        <div className="absolute -top-24 -right-24 size-72 rounded-full bg-violet-300/30 blur-3xl" />
        <div className="absolute -bottom-24 -left-10 size-72 rounded-full bg-indigo-300/30 blur-3xl" />
        <div className="relative grid items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
        <div className="max-w-2xl space-y-5">
          <Badge variant="outline" className="gap-1.5 bg-white/70 backdrop-blur">
            <Users className="size-3" /> 1,284 companies buying together
          </Badge>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Buy like an enterprise.
            <br />
            <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
              Even if you're ten people.
            </span>
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            Describe what you need. Our agent pools your order with other companies,
            unlocks volume pricing, and handles procurement end to end.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              size="lg"
              onClick={() => onProcure()}
              className="bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/25 hover:opacity-90"
            >
              <Sparkles /> Procure with agent
            </Button>
            <Button size="lg" variant="outline" className="bg-white/70">
              Browse open pools
            </Button>
          </div>
        </div>
        <HeroCollage />
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Marketplace</h2>
            <p className="text-sm text-muted-foreground">Live pools closing soon</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search products…" className="pl-9" />
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {categories.map((c, i) => (
            <Button key={c} size="sm" variant={i === 0 ? "default" : "outline"} className="rounded-full">
              {c}
            </Button>
          ))}
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((p, i) => {
            const pct = Math.round((p.pool.committed / p.pool.threshold) * 100)
            const off = Math.round((1 - p.poolPrice / p.listPrice) * 100)
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <Card className="group h-full gap-0 overflow-hidden py-0 transition-shadow hover:shadow-lg">
                  <div className="relative">
                    <ProductArt
                      product={p}
                      className="aspect-[4/3]"
                      imgClassName="transition-transform duration-500 group-hover:scale-105"
                    />
                    <Badge className="absolute top-3 left-3 gap-1 bg-white/90 text-foreground backdrop-blur">
                      <TrendingDown className="size-3 text-emerald-600" /> −{off}% pooled
                    </Badge>
                  </div>
                  <CardContent className="space-y-3 p-4">
                    <div>
                      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        {p.brand}
                      </p>
                      <h3 className="font-semibold">{p.name}</h3>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-semibold">{eur(p.poolPrice)}</span>
                      <span className="text-sm text-muted-foreground line-through">{eur(p.listPrice)}</span>
                    </div>
                    <div className="space-y-1.5">
                      <Progress value={pct} className="h-1.5" />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>
                          {p.pool.committed}/{p.pool.threshold} units · {p.pool.orgs} orgs
                        </span>
                        <span>closes {p.pool.closesIn}</span>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="mt-auto p-4 pt-0">
                    <Button
                      className="w-full"
                      variant={p.id === "aeron" ? "default" : "secondary"}
                      onClick={() =>
                        onProcure(p.id === "aeron" ? defaultRequest : `I'd like to buy the ${p.brand} ${p.name}.`)
                      }
                    >
                      Procure
                    </Button>
                  </CardFooter>
                </Card>
              </motion.div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function HeroCollage() {
  const [aeron, display, desk] = [products[0], products[1], products[3]]
  return (
    <div className="relative hidden h-80 lg:block">
      <motion.img
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        src="/images/office.jpg"
        alt="Shared office space"
        className="absolute inset-0 size-full rounded-2xl object-cover shadow-xl"
      />
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-black/40 to-transparent" />
      {[
        { p: aeron, cls: "-bottom-6 -left-8 rotate-[-4deg]", delay: 0.2 },
        { p: display, cls: "-top-6 -right-4 rotate-[3deg]", delay: 0.3 },
        { p: desk, cls: "-right-6 bottom-10 rotate-[-2deg]", delay: 0.4 },
      ].map(({ p, cls, delay }) => (
        <motion.div
          key={p.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay }}
          className={`absolute w-40 overflow-hidden rounded-xl border bg-white shadow-lg ${cls}`}
        >
          <ProductArt product={p} className="aspect-[4/3]" />
          <div className="flex items-center justify-between px-2.5 py-1.5 text-xs">
            <span className="truncate font-medium">{p.name}</span>
            <span className="font-semibold text-emerald-600">−{Math.round((1 - p.poolPrice / p.listPrice) * 100)}%</span>
          </div>
        </motion.div>
      ))}
      <div className="absolute bottom-4 left-36 flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium shadow backdrop-blur">
        <span className="size-2 animate-pulse rounded-full bg-emerald-500" /> 17 / 25 Aeron chairs pooled in Berlin
      </div>
    </div>
  )
}
