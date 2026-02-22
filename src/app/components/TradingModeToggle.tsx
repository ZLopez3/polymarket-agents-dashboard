"use client";

import { useState, useCallback } from "react";

interface Props {
  strategyId: string;
  strategyName: string;
  initialMode: "paper" | "live";
  onModeChange?: (newMode: "paper" | "live") => void;
}

export default function TradingModeToggle({
  strategyId,
  strategyName,
  initialMode,
  onModeChange,
}: Props) {
  const [mode, setMode] = useState(initialMode);
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLive = mode === "live";

  const toggle = useCallback(async () => {
    const newMode = isLive ? "paper" : "live";

    // Going live requires confirmation
    if (newMode === "live") {
      setShowConfirm(true);
      return;
    }

    await switchMode(newMode);
  }, [isLive]);

  async function switchMode(newMode: "paper" | "live") {
    setLoading(true);
    setError(null);
    setShowConfirm(false);

    try {
      const res = await fetch(`/api/strategies/${strategyId}/mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: newMode }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to switch mode");
        return;
      }

      setMode(newMode);
      onModeChange?.(newMode);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          disabled={loading}
          className={`
            relative inline-flex h-7 w-13 shrink-0 cursor-pointer items-center rounded-full
            transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900
            ${loading ? "opacity-50 cursor-wait" : ""}
            ${isLive ? "bg-emerald-600 focus:ring-emerald-500" : "bg-slate-600 focus:ring-slate-500"}
          `}
          aria-label={`Switch ${strategyName} to ${isLive ? "paper" : "live"} mode`}
        >
          <span
            className={`
              inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200
              ${isLive ? "translate-x-7" : "translate-x-1"}
            `}
          />
        </button>
        <span
          className={`text-xs font-mono font-semibold tracking-wider uppercase ${
            isLive ? "text-emerald-400" : "text-amber-400"
          }`}
        >
          {isLive ? "LIVE" : "PAPER"}
        </span>
      </div>

      {error && (
        <p className="mt-1.5 text-xs text-red-400">{error}</p>
      )}

      {/* Confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-white">
              Switch to Live Trading?
            </h3>
            <p className="mt-2 text-sm text-slate-400">
              <strong className="text-amber-400">{strategyName}</strong> will
              begin placing real orders on Polymarket with real funds. Make sure
              your wallet is funded and risk parameters are configured.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => switchMode("live")}
                disabled={loading}
                className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors disabled:opacity-50"
              >
                {loading ? "Connecting..." : "Go Live"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
