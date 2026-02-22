# Execution / Risk Wrapper (Minimal)

Lightweight HTTP service that writes heartbeats, events, and trades into Supabase.

## Setup

1. Create `.env` (or `env.txt`):
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
PORT=3090

```
2. Install deps:
```
npm install
```
3. Run:
```
node server.js
```

## Endpoints

- `POST /heartbeat`
  ```json
  { "agent_id": "<uuid>", "status": "ok", "detail": "alive" }
  ```

- `POST /event`
  ```json
  { "agent_id": "<uuid>", "event_type": "circuit_breaker", "severity": "warning", "message": "slippage spike" }
  ```

- `POST /trade`
  ```json
  { "strategy_id": "<uuid>", "agent_id": "<uuid>", "market": "BTC-60k", "side": "YES", "notional": 250, "pnl": 4.2 }
  ```

If you cannot create `.env`, place the same contents in `env.txt` in this folder.
