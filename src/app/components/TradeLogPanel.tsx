"use client";

import { useState, useEffect, useCallback } from "react";
import type { TradeLog } from "@/types/dashboard";

interface Props {
  strategyId?: string;
  limit?: number;
}

const EVENT_COLORS: Record<string, string> = {
  live_exec: "text-emerald-400",
  live_request: "text-emerald-300",
  live_response: "text-emerald-400",
  paper_exec: "text-amber-400",
  safety_block: "text-red-400",
  mode_change: "text-blue-400",
  kill_switch: "text-red-500",
};

const EVENT_BG: Record<string, string> = {
  live_exec: "bg-emerald-500/10",
  paper_exec: "bg-amber-500/10",
  safety_block: "bg-red-500/10",
  kill_switch: "bg-red-500/10",
  mode_change: "bg-blue-500/10",
};

function formatTs(ts: string) {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function TradeLogPanel({ strategyId, limit = 50 }: Props) {
  const [logs, setLogs] = useState<TradeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (strategyId) params.set("strategy_id", strategyId);
      const res = await fetch(`/api/trade-logs?${params}`);
      const data = await res.json();
      setLogs(data.logs ?? []);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [strategyId, limit]);

  useEffect(() => {
    if (open) fetchLogs();
  }, [open, fetchLogs]);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/80">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">
            Execution Log
          </span>
          {logs.length > 0 && (
            <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs font-mono text-slate-300">
              {logs.length}
            </span>
          )}
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div className="border-t border-slate-800 px-5 pb-4">
          {loading ? (
            <p className="py-4 text-center text-xs text-slate-500">
              Loading logs...
            </p>
          ) : logs.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-500">
              No execution logs yet
            </p>
          ) : (
            <div className="mt-3 max-h-80 space-y-1.5 overflow-y-auto">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className={`flex items-start gap-3 rounded-lg px-3 py-2 ${EVENT_BG[log.event] ?? "bg-slate-800/50"}`}
                >
                  <span className="mt-0.5 shrink-0 text-xs text-slate-500 font-mono w-32">
                    {formatTs(log.created_at)}
                  </span>
                  <span
                    className={`shrink-0 text-xs font-semibold font-mono uppercase w-28 ${EVENT_COLORS[log.event] ?? "text-slate-400"}`}
                  >
                    {log.event}
                  </span>
                  <span className="min-w-0 flex-1 text-xs text-slate-300 truncate">
                    {log.result || log.error || ""}
                    {log.market_id && (
                      <span className="ml-2 text-slate-500">
                        {log.market_id.slice(0, 12)}...
                      </span>
                    )}
                  </span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold uppercase ${
                      log.mode === "live"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-amber-500/20 text-amber-400"
                    }`}
                  >
                    {log.mode}
                  </span>
                </div>
              ))}
            </div>
          )}

          {!loading && logs.length > 0 && (
            <button
              onClick={fetchLogs}
              className="mt-3 text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Refresh
            </button>
          )}
        </div>
      )}
    </div>
  );
}
