#!/bin/bash
# Demo helper: reset, load the recorded calls for every vendor except the human one, then place ONE real call
# to the human-answered vendor (HUMAN_VENDOR_ID, default vantly). Usage: scripts/demo-live-call.sh [vendorId]
BASE=${BASE_URL:-http://localhost:3000}; LIVE=${1:-vantly}
curl -s -XPOST $BASE/api/demo/reset -o /dev/null && curl -s $BASE/api/pool -o /dev/null
for v in certly vantly trustwise auditly complykit; do
  [ "$v" = "$LIVE" ] && continue
  curl -s -XPOST $BASE/api/pool/negotiate -H 'content-type: application/json' -d "{\"mode\":\"replay\",\"vendorId\":\"$v\"}" -o /dev/null -w "replay $v %{http_code}\n"
done
curl -s -XPOST $BASE/api/pool/negotiate -H 'content-type: application/json' -d "{\"mode\":\"live\",\"vendorId\":\"$LIVE\"}" | python3 -c "import json,sys; d=json.load(sys.stdin); print('LIVE', d.get('vendorId'), d.get('status'), d.get('error') or '')"
