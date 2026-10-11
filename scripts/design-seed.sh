#!/usr/bin/env bash
# Seed-string design directions (String Seed of Thought, Sakana AI; via Lenny's Newsletter,
# "How to turn your AI into a world-class designer"). An LLM cannot act randomly, so the
# shell makes the randomness and the model derives a direction from it. Never show the seed
# in the design itself.
#
#   scripts/design-seed.sh            # one fresh seed and its direction
#   scripts/design-seed.sh 5          # five of them
#   scripts/design-seed.sh - SEED...  # derive directions for given seeds
set -euo pipefail

MOODS=("ink on warm white, near-black type, one hard accent" "light cool neutrals, soft hairlines" "dark deep neutral, light type" "light warm paper, charcoal type" "dark warm charcoal, amber highlights")
LAYOUTS=("single column, one object at a time" "timing tower: one row per competitor, ranked live" "ticker tape: horizontal, time flows left to right" "radial hub and spokes" "ledger: ruled rows, right-aligned numerals" "split stage: one large live pane plus a thin rail" "receipt: narrow vertical tape, totals at the bottom" "radar: positions on a plane, distance encodes price")
TYPES=("one grotesk sans, one weight" "serif display numerals over a sans body" "monospace everywhere" "condensed sans, tight tracking" "humanist sans at large sizes" "slab-serif labels over a sans body")
MOTIONS=("only the live element moves" "numbers roll like an odometer" "rows re-rank with a FLIP transform" "one sweep or needle moves continuously" "typewriter reveal, nothing else animates")

ord() { printf '%d' "'$1"; }

derive() {
  local s="$1"
  local c0 c1 c2 c3 c4
  c0=$(ord "${s:0:1}"); c1=$(ord "${s:1:1}"); c2=$(ord "${s:2:1}"); c3=$(ord "${s:3:1}"); c4=$(ord "${s:4:1}")
  local mood=${MOODS[$((c0 % 5))]}
  local layout=${LAYOUTS[$((c1 % 8))]}
  local type=${TYPES[$((c2 % 6))]}
  local hue=$(( (c3 * 7) % 360 ))
  local motion=${MOTIONS[$((c4 % 5))]}
  printf 'seed    %s\nmood    %s\nlayout  %s\ntype    %s\naccent  hue %d\nmotion  %s\n\n' "$s" "$mood" "$layout" "$type" "$hue" "$motion"
}

if [[ "${1:-}" == "-" ]]; then
  shift
  for s in "$@"; do derive "$s"; done
  exit 0
fi

n="${1:-1}"
for _ in $(seq 1 "$n"); do
  seed=$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 40)
  derive "$seed"
done
