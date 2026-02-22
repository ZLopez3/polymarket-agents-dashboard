#!/usr/bin/env bash
# ---------------------------------------------------------------
# trade-order.sh -- Place a limit order on Polymarket via the
#                    /api/poly/order endpoint.
#
# Usage:
#   ./scripts/trade-order.sh <tokenId> <price> <size> <side> [orderType] [conditionId]
#
# Example:
#   ./scripts/trade-order.sh \
#     "71321045679252212594626385532706912750332728571942532289631379312455583992563" \
#     0.55 10 BUY GTC "0xabc123..."
#
# Environment:
#   APP_URL       - Base URL of your deployed app (default: http://localhost:3000)
#   CRON_SECRET   - Bearer token for API auth
# ---------------------------------------------------------------

set -euo pipefail

TOKEN_ID="${1:?Usage: trade-order.sh <tokenId> <price> <size> <side> [orderType] [conditionId]}"
PRICE="${2:?Missing price}"
SIZE="${3:?Missing size}"
SIDE="${4:?Missing side (BUY or SELL)}"
ORDER_TYPE="${5:-GTC}"
CONDITION_ID="${6:-}"

APP_URL="${APP_URL:-http://localhost:3000}"
AUTH_HEADER=""
if [ -n "${CRON_SECRET:-}" ]; then
  AUTH_HEADER="-H \"Authorization: Bearer ${CRON_SECRET}\""
fi

# Build the JSON body
BODY=$(cat <<EOF
{
  "tokenId": "${TOKEN_ID}",
  "price": ${PRICE},
  "size": ${SIZE},
  "side": "${SIDE}",
  "orderType": "${ORDER_TYPE}"$([ -n "${CONDITION_ID}" ] && echo ",
  \"conditionId\": \"${CONDITION_ID}\"" || echo "")
}
EOF
)

echo "==> Placing order on ${APP_URL}/api/poly/order"
echo "    Token: ${TOKEN_ID:0:16}..."
echo "    Price: ${PRICE} | Size: ${SIZE} | Side: ${SIDE} | Type: ${ORDER_TYPE}"
echo ""

# Execute the request
eval curl -s -w "\n\nHTTP Status: %{http_code}\n" \
  -X POST "${APP_URL}/api/poly/order" \
  -H "Content-Type: application/json" \
  ${AUTH_HEADER} \
  -d "'${BODY}'" | tee /dev/stderr | head -1 | python3 -m json.tool 2>/dev/null || true
