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
  live_error: "text-red-400",
  paper_exec: "text-amber-400",
  safety_block: "text-red-400",
  mode_change: "text-blue-400",
  kill_switch: "text-red-500",
};

const EVENT_BG: Record<string, string> = {
  live_exec: "bg-emerald-500/10",
  live_error: "bg-red-500/10",
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

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 text-xs">
      <span className="shrink-0 w-24 text-slate-500 font-mono">{label}</span>
      <span className="text-slate-300 break-all font-mono">{value}</span>
    </div>
  );
}

function OrderDetailsBlock({ details }: { details: Record<string, unknown> }) {
  const entries = Object.entries(details);
  if (entries.length === 0) return null;
  return (
    <div className="space-y-1">
      <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Order Details</span>
      <div className="rounded-lg bg-slate-950/60 border border-slate-800/50 p-3 space-y-1.5">
        {entries.map(([key, val]) => (
          <div key={key} className="flex gap-3 text-xs">
            <span className="shrink-0 w-28 text-slate-500 font-mono">{key}</span>
            <span className="text-slate-300 break-all font-mono">
              {typeof val === "object" && val !== null ? JSON.stringify(val, null, 2) : String(val ?? "")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TradeLogPanel({ strategyId, limit = 50 }: Props) {
  const [logs, setLogs] = useState<TradeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

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
            <div className="mt-3 max-h-[500px] space-y-1.5 overflow-y-auto">
              {logs.map((log) => {
                const isExpanded = expandedId === log.id;
                const hasDetails = !!(log.order_details || log.error || log.market_id || log.result);
                return (
                  <div key={log.id}>
                    <button
                      onClick={() => hasDetails && toggleExpand(log.id)}
                      className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                        EVENT_BG[log.event] ?? "bg-slate-800/50"
                      } ${hasDetails ? "cursor-pointer hover:bg-slate-700/40" : "cursor-default"} ${
                        isExpanded ? "rounded-b-none" : ""
                      }`}
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
                      {hasDetails && (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </button>

                    {isExpanded && (
                      <div className={`rounded-b-lg border-t border-slate-800/50 px-4 py-3 space-y-2.5 ${
                        EVENT_BG[log.event] ?? "bg-slate-800/50"
                      }`}>
                        <DetailRow label="Event" value={log.event} />
                        <DetailRow label="Mode" value={log.mode} />
                        <DetailRow label="Market ID" value={log.market_id} />
                        <DetailRow label="Result" value={log.result} />
                        {log.error && (
                          <div className="flex gap-3 text-xs">
                            <span className="shrink-0 w-24 text-slate-500 font-mono">Error</span>
                            <span className="text-red-400 break-all font-mono">{log.error}</span>
                          </div>
                        )}
                        <DetailRow label="Strategy" value={log.strategy_id} />
                        <DetailRow label="Timestamp" value={log.created_at} />
                        {log.order_details && Object.keys(log.order_details).length > 0 && (
                          <OrderDetailsBlock details={log.order_details} />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
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
