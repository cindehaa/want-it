"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Steps, { type StepDef } from "./Steps";
import { Card, Fact, Heading, PrimaryButton, PrimaryLink, QuietButton, QuietLink, Screen } from "./ui";

/* Hard-coded demo: compose, matching, match, buying, settled. Timer-driven; no API. */

type ScreenId = "compose" | "matching" | "match" | "buying" | "settled";

const TICK_MS = 100;
const STEP_SECONDS = 1;

const DEFAULT_TEXT =
  "We need 10 seats of SOC 2 compliance software for our team by the end of the month, ideally under $25 a seat.";

const MATCH_STEPS: readonly StepDef[] = [
  ["Reading your listing", "SOC 2, 10 seats, $25.00 cap"],
  ["Searching open listings", "212 listings, 5 vendors"],
  ["Matching quotes", "1 match"],
];

const BUY_STEPS: readonly StepDef[] = [
  ["Card hold placed", "$229.30, simulated"],
  ["Group price locked with Certly", "$22.93 a seat, 7 days"],
  ["10 accounts provisioned", "separate workspace"],
  ["Redemption link sent", "you@acme.com"],
];

/* Seconds each timed screen stays before advancing on its own. */
const AUTO_ADVANCE: Partial<Record<ScreenId, { after: number; to: ScreenId }>> = {
  matching: { after: 3.3, to: "match" },
  match: { after: 6, to: "buying" },
  buying: { after: 4.6, to: "settled" },
};

export default function NewListingClient() {
  const [screen, setScreen] = useState<ScreenId>("compose");
  const [since, setSince] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [text, setText] = useState(DEFAULT_TEXT);

  const elapsed = (now - since) / 1000;

  function go(next: ScreenId) {
    const t = Date.now();
    setScreen(next);
    setSince(t);
    setNow(t);
  }

  useEffect(() => {
    const rule = AUTO_ADVANCE[screen];
    if (!rule) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [screen]);

  useEffect(() => {
    const rule = AUTO_ADVANCE[screen];
    if (rule && elapsed >= rule.after) go(rule.to);
  }, [screen, elapsed]);

  return (
    <main className="mx-auto flex w-full max-w-[800px] flex-col gap-7 px-6 pb-12 pt-14">
      {screen === "compose" && (
        <Screen label="New listing" className="gap-6">
          <Heading title="New listing">
            Say what you need in plain words. We turn it into a listing and match it with other startups and vendors.
          </Heading>
          <label className="flex flex-col gap-2">
            <span className="text-[13px] font-medium text-muted">What do you need?</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              className="box-border w-full resize-y rounded-[10px] border-[1.5px] border-ink bg-surface px-[18px] py-4 text-lg leading-normal text-ink"
            />
          </label>
          <Card className="flex flex-col gap-2.5 px-5 py-4">
            <span className="text-[13px] font-medium text-muted">Read as</span>
            <dl className="tabular m-0 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <Fact label="Product">SOC 2 compliance software</Fact>
              <Fact label="Seats">10</Fact>
              <Fact label="Max per seat">$25.00</Fact>
              <Fact label="Need by">Oct 31</Fact>
            </dl>
          </Card>
          <div className="flex items-center justify-between gap-4">
            <PrimaryButton onClick={() => go("matching")}>Post listing</PrimaryButton>
            <QuietLink href="/">Cancel</QuietLink>
          </div>
        </Screen>
      )}

      {screen === "matching" && (
        <Screen label="Matching" live className="gap-7 pt-12">
          <Heading title="Matching">Your listing is live. Looking for startups and vendors that want the same thing.</Heading>
          <Steps steps={MATCH_STEPS} elapsed={elapsed} per={STEP_SECONDS} />
        </Screen>
      )}

      {screen === "match" && <MatchScreen elapsed={elapsed} onBuy={() => go("buying")} />}

      {screen === "buying" && (
        <Screen label="Buying" live className="gap-7 pt-6">
          <Heading title="Buying for you">10 seats of Certly SOC 2 compliance at the group price.</Heading>
          <Steps steps={BUY_STEPS} elapsed={elapsed} per={STEP_SECONDS} />
        </Screen>
      )}

      {screen === "settled" && <SettledScreen onRestart={() => go("compose")} />}
    </main>
  );
}

function MatchScreen({ elapsed, onBuy }: { elapsed: number; onBuy: () => void }) {
  const filled = elapsed >= 0.3;
  const thresholdHit = elapsed >= 1.2;
  const countdown = Math.max(0, Math.ceil(AUTO_ADVANCE.match!.after - elapsed));

  return (
    <Screen label="Match found" className="gap-6">
      <Heading title="Match found">Your seats complete a Certly group that was 10 seats short of its price tier.</Heading>

      <div className="grid grid-cols-1 items-stretch sm:grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)]">
        <Card className="flex flex-col gap-2 px-5 py-[18px]">
          <span className="text-xs font-medium text-muted">Your listing</span>
          <span className="text-[17px] font-semibold">10 seats, SOC 2 compliance</span>
          <span className="tabular text-sm text-muted">Max $25.00 a seat, need by Oct 31</span>
        </Card>
        <div aria-hidden className="flex items-center justify-center py-2 sm:py-0">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--color-faint)" strokeWidth="1.8" strokeLinecap="round">
            <path d="M8 2v12M2 8h12" />
          </svg>
        </div>
        <Card strong className="flex flex-col gap-2 px-5 py-[18px]">
          <span className="text-xs font-medium text-muted">Certly listing, test vendor</span>
          <span className="text-[17px] font-semibold">50-seat group at $22.93 a seat</span>
          <span className="tabular text-sm text-muted">40 seats committed by 3 startups, list $30.00</span>
        </Card>
      </div>

      <Card className="flex flex-col gap-3 px-5 py-[18px]">
        <div className="flex items-baseline justify-between gap-3">
          <span className="tabular text-[15px] font-medium">{thresholdHit ? "Threshold reached" : "Filling the 50-seat tier"}</span>
          <span className="tabular text-[13px] text-muted">50 of 50 seats</span>
        </div>
        <div aria-hidden className="relative h-2 rounded bg-canvas">
          <div className="wi-meter-fill absolute left-0 top-0 h-2 rounded bg-accent" style={{ width: filled ? "100%" : "80%" }} />
        </div>
        {thresholdHit && (
          <p className="wi-pop tabular m-0 text-[15px]">
            Threshold reached. Group price <strong>$22.93</strong> a seat, under your $25.00 cap, <strong>24%</strong> below list.
          </p>
        )}
      </Card>

      <div className="flex items-center justify-between gap-4">
        <PrimaryButton onClick={onBuy}>Buy 10 seats at $22.93</PrimaryButton>
        <span className="tabular text-[13px] text-muted">Buying automatically in {countdown}s. Your cap allows it.</span>
      </div>
    </Screen>
  );
}

function SettledScreen({ onRestart }: { onRestart: () => void }) {
  return (
    <Screen label="Settled" className="gap-6">
      <Heading title="Settled">10 seats at $22.93. You saved $70.70 against list, and spent about a minute.</Heading>

      <section aria-label="Receipt" className="flex flex-col gap-3.5 rounded-[10px] border border-line bg-surface px-[26px] py-[22px]">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <dl className="tabular m-0 grid grid-cols-[repeat(3,auto)] justify-start gap-6 text-sm">
            <Fact label="Vendor">Certly, test vendor</Fact>
            <Fact label="Seats">10 at $22.93</Fact>
            <Fact label="Group">50 seats, 4 startups</Fact>
          </dl>
          <div className="sm:text-right">
            <p className="m-0 text-xs text-muted">Charged, simulated</p>
            <p className="tabular m-0 mt-0.5 text-[28px] font-semibold leading-none tracking-[-0.025em]">$229.30</p>
          </div>
        </div>
        <dl className="tabular m-0 flex flex-col gap-2 border-t border-line pt-3.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">List price, 10 seats</dt>
            <dd className="m-0">$300.00</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Group price, 10 seats</dt>
            <dd className="m-0">$229.30</dd>
          </div>
          <div className="flex justify-between font-semibold">
            <dt>Saved</dt>
            <dd className="m-0 text-accent-strong">$70.70</dd>
          </div>
        </dl>
        <p className="tabular m-0 text-[13px] text-muted">
          Your account:{" "}
          <Link href="/" className="text-accent-strong hover:text-accent">
            certly.test/redeem/acme-7f3k
          </Link>
          , sent to you@acme.com. Test vendor, nothing real is provisioned.
        </p>
      </section>

      <div className="flex items-center justify-between gap-4">
        <PrimaryLink href="/" tone="ink">
          Back to the marketplace
        </PrimaryLink>
        <QuietButton onClick={onRestart}>Post another listing</QuietButton>
      </div>
    </Screen>
  );
}
