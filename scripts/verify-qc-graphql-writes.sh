#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   MAGICQC_API_KEY=xxxx ./scripts/verify-qc-graphql-writes.sh
#   ./scripts/verify-qc-graphql-writes.sh <endpoint> <api-key>
#
# Optional env overrides:
#   POA_ID=33 MEASUREMENT_ID=31 SIZE=S OPERATOR_ID=2
#   MAGICQC_HOST_HEADER=magicqc.online

ENDPOINT="${1:-${MAGICQC_GRAPHQL_URL:-https://127.0.0.1/graphql}}"
API_KEY="${2:-${MAGICQC_API_KEY:-}}"
HOST_HEADER="${MAGICQC_HOST_HEADER:-magicqc.online}"
POA_ID="${POA_ID:-33}"
MEASUREMENT_ID="${MEASUREMENT_ID:-31}"
SIZE="${SIZE:-S}"
OPERATOR_ID="${OPERATOR_ID:-2}"

if [[ -z "$API_KEY" ]]; then
  echo "❌ Missing API key. Provide as second arg or set MAGICQC_API_KEY." >&2
  exit 2
fi

run_probe() {
  local label="$1"
  local query="$2"
  local vars_json="$3"
  local data_key="$4"

  echo "\n==> $label"

  local payload
  payload=$(python3 - <<'PY' "$query" "$vars_json"
import json, sys
query = sys.argv[1]
vars_json = sys.argv[2]
variables = json.loads(vars_json)
print(json.dumps({"query": query, "variables": variables}))
PY
)

  local resp
  resp=$(curl -k -sS "$ENDPOINT" \
    -H "Host: $HOST_HEADER" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: $API_KEY" \
    --data "$payload")

  python3 - <<'PY' "$resp" "$data_key" "$label"
import json, sys
raw, key, label = sys.argv[1], sys.argv[2], sys.argv[3]
try:
    obj = json.loads(raw)
except Exception:
    print(f"❌ {label}: non-JSON response")
    print(raw)
    raise SystemExit(3)

if obj.get("errors"):
    print(f"❌ {label}: GraphQL errors")
    for e in obj["errors"]:
        print(" -", e.get("message", str(e)))
    raise SystemExit(4)

node = (obj.get("data") or {}).get(key)
if node is None:
    print(f"❌ {label}: missing data.{key}")
    print(json.dumps(obj, indent=2))
    raise SystemExit(5)

ok = bool(node.get("success"))
msg = node.get("message")
cnt = node.get("count")
if ok:
    suffix = f" (count={cnt})" if cnt is not None else ""
    print(f"✅ {label}: success=true{suffix}")
    if msg:
        print("   message:", msg)
    raise SystemExit(0)

print(f"❌ {label}: success=false")
if msg:
    print("   message:", msg)
raise SystemExit(6)
PY
}

MUTATION_RESULTS=$(cat <<'GRAPHQL'
mutation SaveTest($results: [MeasurementResultInput!]!) {
  upsertMeasurementResults(results: $results) {
    success
    message
    count
  }
}
GRAPHQL
)

VARS_RESULTS=$(cat <<JSON
{"results":[{"purchase_order_article_id":$POA_ID,"measurement_id":$MEASUREMENT_ID,"size":"$SIZE","measured_value":7.47,"status":"PASS","operator_id":$OPERATOR_ID}]}
JSON
)

MUTATION_DETAILED=$(cat <<'GRAPHQL'
mutation SaveDetailed($poa:Int!, $size:String!, $side:String!, $results:[DetailedResultInput!]!) {
  upsertMeasurementResultsDetailed(
    purchase_order_article_id:$poa,
    size:$size,
    side:$side,
    results:$results
  ) {
    success
    message
    count
  }
}
GRAPHQL
)

VARS_DETAILED=$(cat <<JSON
{"poa":$POA_ID,"size":"$SIZE","side":"front","results":[{"measurement_id":$MEASUREMENT_ID,"measured_value":7.47,"expected_value":7.40,"tol_plus":0.20,"tol_minus":0.20,"status":"PASS","operator_id":$OPERATOR_ID}]}
JSON
)

rc=0
run_probe "upsertMeasurementResults" "$MUTATION_RESULTS" "$VARS_RESULTS" "upsertMeasurementResults" || rc=$?
run_probe "upsertMeasurementResultsDetailed" "$MUTATION_DETAILED" "$VARS_DETAILED" "upsertMeasurementResultsDetailed" || rc=$?

if [[ "$rc" -ne 0 ]]; then
  echo "\n❌ QC write probe FAILED against: $ENDPOINT"
  echo "Likely causes: stale deployment, wrong target environment, or unresolved schema drift."
  exit "$rc"
fi

echo "\n✅ QC write probe PASSED against: $ENDPOINT"
echo "Host header used: $HOST_HEADER"
