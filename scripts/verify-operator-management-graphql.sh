#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   MAGICQC_API_KEY=xxxx ./scripts/verify-operator-management-graphql.sh
#   ./scripts/verify-operator-management-graphql.sh <endpoint> <api-key>
#
# Optional env overrides:
#   MAGICQC_HOST_HEADER=magicqc.online
#   TEST_OPERATOR_EMPLOYEE_ID=OP-VERIFY-001
#   TEST_OPERATOR_PIN=1234
#   TEST_OPERATOR_NEW_PIN=4321

ENDPOINT="${1:-${MAGICQC_GRAPHQL_URL:-https://127.0.0.1/graphql}}"
API_KEY="${2:-${MAGICQC_API_KEY:-}}"
HOST_HEADER="${MAGICQC_HOST_HEADER:-magicqc.online}"
TEST_OPERATOR_PIN="${TEST_OPERATOR_PIN:-1234}"
TEST_OPERATOR_NEW_PIN="${TEST_OPERATOR_NEW_PIN:-4321}"

if [[ -z "$API_KEY" ]]; then
  echo "❌ Missing API key. Provide as second arg or set MAGICQC_API_KEY." >&2
  exit 2
fi

if [[ ! "$TEST_OPERATOR_PIN" =~ ^[0-9]{4}$ ]]; then
  echo "❌ TEST_OPERATOR_PIN must be exactly 4 digits." >&2
  exit 2
fi

if [[ ! "$TEST_OPERATOR_NEW_PIN" =~ ^[0-9]{4}$ ]]; then
  echo "❌ TEST_OPERATOR_NEW_PIN must be exactly 4 digits." >&2
  exit 2
fi

EMPLOYEE_ID="${TEST_OPERATOR_EMPLOYEE_ID:-OP-VERIFY-$(date +%s)}"
FULL_NAME="Probe Operator"
DEPARTMENT="QC"
CONTACT_NUMBER="0000000000"

run_graphql() {
  local query="$1"
  local vars_json="$2"

  local payload
  payload=$(python3 - <<'PY' "$query" "$vars_json"
import json, sys
query = sys.argv[1]
variables = json.loads(sys.argv[2])
print(json.dumps({"query": query, "variables": variables}))
PY
)

  curl -k -sS "$ENDPOINT" \
    -H "Host: $HOST_HEADER" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: $API_KEY" \
    --data "$payload"
}

expect_mutation_success() {
  local label="$1"
  local data_key="$2"
  local query="$3"
  local vars_json="$4"

  echo "\n==> $label"
  local resp
  resp=$(run_graphql "$query" "$vars_json")

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

if node.get("success") is True:
    print(f"✅ {label}: success=true")
    msg = node.get("message")
    if msg:
        print("   message:", msg)
    raise SystemExit(0)

print(f"❌ {label}: success=false")
print("   message:", node.get("message"))
raise SystemExit(6)
PY
}

expect_verify_pin_result() {
  local label="$1"
  local employee_id="$2"
  local pin="$3"
  local expected_success="$4"

  local query
  query=$(cat <<'GRAPHQL'
mutation Verify($employee_id: String!, $pin: String!) {
  verifyPin(employee_id: $employee_id, pin: $pin) {
    success
    message
    operator {
      id
      employee_id
    }
  }
}
GRAPHQL
)

  local vars_json
  vars_json=$(cat <<JSON
{"employee_id":"$employee_id","pin":"$pin"}
JSON
)

  echo "\n==> $label"
  local resp
  resp=$(run_graphql "$query" "$vars_json")

  python3 - <<'PY' "$resp" "$label" "$expected_success"
import json, sys
raw, label, expected = sys.argv[1], sys.argv[2], sys.argv[3].lower() == "true"

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

node = (obj.get("data") or {}).get("verifyPin")
if node is None:
    print(f"❌ {label}: missing data.verifyPin")
    print(json.dumps(obj, indent=2))
    raise SystemExit(5)

actual = bool(node.get("success"))
if actual == expected:
    print(f"✅ {label}: success={str(actual).lower()} (expected)")
    msg = node.get("message")
    if msg:
        print("   message:", msg)
    raise SystemExit(0)

print(f"❌ {label}: expected success={str(expected).lower()} but got {str(actual).lower()}")
print("   message:", node.get("message"))
raise SystemExit(7)
PY
}

MUTATION_CREATE=$(cat <<'GRAPHQL'
mutation CreateOperator(
  $full_name: String!
  $employee_id: String!
  $department: String
  $contact_number: String
  $login_pin: String!
) {
  createOperator(
    full_name: $full_name
    employee_id: $employee_id
    department: $department
    contact_number: $contact_number
    login_pin: $login_pin
  ) {
    success
    message
    operator {
      id
      full_name
      employee_id
      department
      is_active
    }
  }
}
GRAPHQL
)

VARS_CREATE=$(cat <<JSON
{"full_name":"$FULL_NAME","employee_id":"$EMPLOYEE_ID","department":"$DEPARTMENT","contact_number":"$CONTACT_NUMBER","login_pin":"$TEST_OPERATOR_PIN"}
JSON
)

echo "\n==> createOperator"
CREATE_RESP=$(run_graphql "$MUTATION_CREATE" "$VARS_CREATE")

OPERATOR_ID=$(python3 - <<'PY' "$CREATE_RESP"
import json, sys
obj = json.loads(sys.argv[1])
if obj.get("errors"):
    print("__ERR__")
    raise SystemExit(0)
node = (obj.get("data") or {}).get("createOperator") or {}
if not node.get("success"):
    print("__ERR__")
    raise SystemExit(0)
operator = node.get("operator") or {}
print(operator.get("id", "__ERR__"))
PY
)

if [[ "$OPERATOR_ID" == "__ERR__" || -z "$OPERATOR_ID" ]]; then
  echo "❌ createOperator failed"
  echo "$CREATE_RESP"
  exit 6
fi

echo "✅ createOperator: success=true"
echo "   operator_id: $OPERATOR_ID"
echo "   employee_id: $EMPLOYEE_ID"

expect_verify_pin_result "verifyPin (active operator, initial PIN)" "$EMPLOYEE_ID" "$TEST_OPERATOR_PIN" "true"

MUTATION_UPDATE=$(cat <<'GRAPHQL'
mutation UpdateOperator($id: Int!, $full_name: String, $department: String, $contact_number: String) {
  updateOperator(
    id: $id
    full_name: $full_name
    department: $department
    contact_number: $contact_number
  ) {
    success
    message
    operator {
      id
      full_name
      department
      contact_number
    }
  }
}
GRAPHQL
)

VARS_UPDATE=$(cat <<JSON
{"id":$OPERATOR_ID,"full_name":"Probe Operator Updated","department":"QA","contact_number":"1111111111"}
JSON
)
expect_mutation_success "updateOperator" "updateOperator" "$MUTATION_UPDATE" "$VARS_UPDATE"

MUTATION_RESET_PIN=$(cat <<'GRAPHQL'
mutation ResetPin($id: Int!, $new_pin: String!) {
  resetOperatorPin(id: $id, new_pin: $new_pin) {
    success
    message
  }
}
GRAPHQL
)

VARS_RESET_PIN=$(cat <<JSON
{"id":$OPERATOR_ID,"new_pin":"$TEST_OPERATOR_NEW_PIN"}
JSON
)
expect_mutation_success "resetOperatorPin" "resetOperatorPin" "$MUTATION_RESET_PIN" "$VARS_RESET_PIN"

expect_verify_pin_result "verifyPin (old PIN after reset)" "$EMPLOYEE_ID" "$TEST_OPERATOR_PIN" "false"
expect_verify_pin_result "verifyPin (new PIN after reset)" "$EMPLOYEE_ID" "$TEST_OPERATOR_NEW_PIN" "true"

MUTATION_DEACTIVATE=$(cat <<'GRAPHQL'
mutation Deactivate($id: Int!) {
  deactivateOperator(id: $id) {
    success
    message
  }
}
GRAPHQL
)

VARS_DEACTIVATE=$(cat <<JSON
{"id":$OPERATOR_ID}
JSON
)
expect_mutation_success "deactivateOperator" "deactivateOperator" "$MUTATION_DEACTIVATE" "$VARS_DEACTIVATE"
expect_verify_pin_result "verifyPin (inactive operator)" "$EMPLOYEE_ID" "$TEST_OPERATOR_NEW_PIN" "false"

MUTATION_REACTIVATE=$(cat <<'GRAPHQL'
mutation Reactivate($id: Int!) {
  reactivateOperator(id: $id) {
    success
    message
  }
}
GRAPHQL
)

VARS_REACTIVATE=$(cat <<JSON
{"id":$OPERATOR_ID}
JSON
)
expect_mutation_success "reactivateOperator" "reactivateOperator" "$MUTATION_REACTIVATE" "$VARS_REACTIVATE"
expect_verify_pin_result "verifyPin (reactivated operator)" "$EMPLOYEE_ID" "$TEST_OPERATOR_NEW_PIN" "true"

echo "\n✅ Operator management GraphQL probe PASSED against: $ENDPOINT"
echo "Host header used: $HOST_HEADER"
echo "Test operator employee_id: $EMPLOYEE_ID"
