import benchmarkJson from "@/data/benchmark.json";
import { Benchmark, type Call, type Order, type TimeSaved } from "@/lib/contracts";
import { listPriceFor } from "@/lib/vendors";
import { callMinutes } from "@/lib/dial/duration";

export const benchmark = Benchmark.parse(benchmarkJson);

export function computeTimeSaved(members: Order[], calls: Call[]): TimeSaved {
  const n = members.length;
  const base = benchmark.steps.reduce((s, x) => s + x.baselineMinutesPerBuyer, 0);
  const ours = benchmark.steps.reduce((s, x) => s + x.ourMinutesPerBuyer, 0);
  const agentMinutes = calls.reduce((s, c) => s + callMinutes(c), 0);
  const money = members.reduce((s, o) => (o.status === "deal_applied" || o.status === "charged") && o.finalPricePerSeatCents != null
    ? s + (listPriceFor(o.category, o.preferredVendorId) - o.finalPricePerSeatCents) * o.seats : s, 0);
  return {
    buyers: n,
    baselineMinutesTotal: n * base,
    ourMinutesTotal: n * ours,
    netHumanMinutesSaved: n * (base - ours),
    vendorSalesCyclesAvoided: Math.max(0, n - calls.filter((c) => c.status !== "failed").length),
    agentCallMinutes: Math.round(agentMinutes),
    moneySavedCents: Math.max(0, money),
    hasEstimates: benchmark.steps.some((s) => s.kind === "estimate"),
  };
}
