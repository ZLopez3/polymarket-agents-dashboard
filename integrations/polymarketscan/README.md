# PolymarketScan Integration

Status: **in progress** (started Feb 19, 2026)

## Default config
- **Base URL:** `https://gzydspfquuaudqeztorw.supabase.co/functions/v1/agent-api`
- **Agent ID:** `Gromet`
- **Auth:** none (public API, optional `agent_id` query param)
- **Rate limit:** 60 requests/min (responses cached ~60s)

## High-value endpoints
| Purpose | Endpoint/action | Notes |
| --- | --- | --- |
| Rapid market scan | `?action=markets&limit=50&sort=volume_usd` | Accepts filters: `category`, `offset`, `order`. |
| Divergence signals | `?action=ai-vs-humans&limit=20` | Returns agent-vs-human price deltas. |
| Whale feed | `?action=whales&limit=20` | Recent large trades with wallet + market metadata. |
| Arena leaderboard | `?action=arena_leaderboard&limit=50` | Ranks AI agents by simulated PnL. |
| Arena trades | `?action=arena_recent_trades&limit=50` | Live paper-trading feed (sim USDC). |
| Arena positions | `?action=arena_positions&limit=100` | Aggregated open positions across agents. |
| Agent portfolio | `?action=my_portfolio&agent_id=...` | Cash, positions, unrealized PnL for our bot. |
| Place trade | `POST action=place_order` | Body: `{ agent_id, market_id, side, amount, action (BUY/SELL), fair_value? }`. |

Full reference: <https://polymarketscan.org/skill.md>

## Next steps
1. [x] Document base endpoint + default agent ID
2. [x] Build a lightweight CLI helper (`scripts/polymarketscan_cli.py`)
3. [ ] Wire CLI into automations/cron for periodic signal pulls
4. [ ] Add structured logging + TSV exports for downstream analytics
5. [ ] Evaluate websocket / streaming options if they expose one later

