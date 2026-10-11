import type { LucideIcon } from "lucide-react"
import {
  Armchair,
  Headphones,
  Keyboard,
  Lamp,
  Laptop,
  Monitor,
  Printer,
  Table2,
} from "lucide-react"

export type Product = {
  id: string
  name: string
  brand: string
  category: string
  icon: LucideIcon
  tint: string
  image: string
  fit?: "contain"
  gallery?: string[]
  listPrice: number
  poolPrice: number
  pool: { committed: number; threshold: number; orgs: number; closesIn: string }
}

export const products: Product[] = [
  {
    id: "aeron",
    name: "Aeron Chair",
    brand: "Herman Miller",
    category: "Seating",
    icon: Armchair,
    tint: "from-zinc-800 to-zinc-600",
    image: "/images/aeron.jpg",
    gallery: ["/images/aeron.jpg", "/images/aeron-2.jpg", "/images/aeron-3.jpg"],
    listPrice: 1849,
    poolPrice: 1329,
    pool: { committed: 17, threshold: 25, orgs: 4, closesIn: "3d" },
  },
  {
    id: "studio-display",
    name: "Studio Display 27″",
    brand: "Apple",
    category: "Displays",
    icon: Monitor,
    tint: "from-sky-500 to-indigo-500",
    image: "/images/studio-display.jpg",
    listPrice: 1749,
    poolPrice: 1489,
    pool: { committed: 42, threshold: 50, orgs: 9, closesIn: "6d" },
  },
  {
    id: "mbp",
    name: "MacBook Pro 14″ M5",
    brand: "Apple",
    category: "Laptops",
    icon: Laptop,
    tint: "from-slate-500 to-slate-400",
    image: "/images/mbp.jpg",
    listPrice: 2199,
    poolPrice: 1949,
    pool: { committed: 31, threshold: 40, orgs: 7, closesIn: "2d" },
  },
  {
    id: "jarvis",
    name: "Jarvis Standing Desk",
    brand: "Fully",
    category: "Desks",
    icon: Table2,
    tint: "from-amber-500 to-orange-500",
    image: "/images/desk.jpg",
    listPrice: 749,
    poolPrice: 589,
    pool: { committed: 12, threshold: 30, orgs: 3, closesIn: "9d" },
  },
  {
    id: "mx-keys",
    name: "MX Keys S Combo",
    brand: "Logitech",
    category: "Peripherals",
    icon: Keyboard,
    tint: "from-emerald-500 to-teal-500",
    image: "/images/mx-keys.jpg",
    fit: "contain",
    listPrice: 189,
    poolPrice: 139,
    pool: { committed: 88, threshold: 100, orgs: 14, closesIn: "1d" },
  },
  {
    id: "wh1000",
    name: "WH-1000XM6",
    brand: "Sony",
    category: "Audio",
    icon: Headphones,
    tint: "from-fuchsia-500 to-pink-500",
    image: "/images/headphones.jpg",
    listPrice: 449,
    poolPrice: 359,
    pool: { committed: 23, threshold: 60, orgs: 5, closesIn: "12d" },
  },
  {
    id: "tizio",
    name: "Tizio LED Desk Lamp",
    brand: "Artemide",
    category: "Lighting",
    icon: Lamp,
    tint: "from-rose-500 to-red-500",
    image: "/images/tizio.jpg",
    listPrice: 529,
    poolPrice: 419,
    pool: { committed: 6, threshold: 20, orgs: 2, closesIn: "14d" },
  },
  {
    id: "mfp",
    name: "imageRUNNER C7570i",
    brand: "Canon",
    category: "Office",
    icon: Printer,
    tint: "from-violet-500 to-purple-500",
    image: "/images/copier.jpg",
    listPrice: 3290,
    poolPrice: 2790,
    pool: { committed: 4, threshold: 10, orgs: 3, closesIn: "20d" },
  },
]

export const aeron = products[0]

export const defaultRequest =
  "We need 8 ergonomic office chairs for our new Berlin office — ideally Herman Miller Aeron, size B, graphite. Should arrive before end of November, budget is around €1,400 per chair."

export const parsedSpec = [
  { label: "Product", value: "Herman Miller Aeron (Remastered)" },
  { label: "Configuration", value: "Size B · Graphite · PostureFit SL" },
  { label: "Quantity", value: "8 units" },
  { label: "Target price", value: "≤ €1,400 / unit" },
  { label: "Deliver to", value: "Berlin, DE" },
  { label: "Deadline", value: "Nov 28, 2026" },
]

export const myUnits = 8

export type Candidate = {
  id: string
  title: string
  detail: string
  score: number
  match: boolean
  reason: string
  image?: string
}

export const candidates: Candidate[] = [
  {
    id: "POOL-1184",
    title: "Steelcase Leap V2 — 30 units",
    detail: "Munich · 5 orgs",
    score: 41,
    match: false,
    reason: "Different model",
  },
  {
    id: "POOL-2047",
    title: "Aeron Size C — Mineral",
    detail: "Amsterdam · 2 orgs",
    score: 63,
    match: false,
    reason: "Size / finish mismatch",
    image: "/images/aeron-3.jpg",
  },
  {
    id: "POOL-1930",
    title: "Aeron Size B — Graphite",
    detail: "New York · 6 orgs",
    score: 72,
    match: false,
    reason: "Ships from US warehouse",
    image: "/images/aeron-2.jpg",
  },
  {
    id: "POOL-2291",
    title: "Aeron Size B — Graphite",
    detail: "Berlin · 4 orgs",
    score: 97,
    match: true,
    reason: "Same spec, same region",
    image: "/images/aeron.jpg",
  },
  {
    id: "POOL-0877",
    title: "Embody Gaming — 12 units",
    detail: "Hamburg · 3 orgs",
    score: 38,
    match: false,
    reason: "Different model",
  },
]

export const poolMembers = [
  { name: "Lumen Robotics", units: 6, color: "bg-sky-500" },
  { name: "Kiez Ventures", units: 5, color: "bg-amber-500" },
  { name: "Nordlicht Studio", units: 4, color: "bg-emerald-500" },
  { name: "Feldweg GmbH", units: 2, color: "bg-fuchsia-500" },
]

export const priceTiers = [
  { min: 1, price: 1849, label: "List" },
  { min: 10, price: 1590, label: "Tier 1" },
  { min: 25, price: 1329, label: "Tier 2" },
]

export const eur = (n: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n)
