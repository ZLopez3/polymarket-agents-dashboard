"use client";

import { useState, useCallback } from "react";

interface Props {
  hasLiveStrategies: boolean;
  onKill?: () => void;
}

export default function KillSwitch({ hasLiveStrategies, onKill }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleKill = useCallback(async () => {
    setLoading(true);
    setResult(null);
    setShowConfirm(false);

    try {
      const res = await fetch("/api/strategies/kill-switch", {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        setResult(`Error: ${data.error}`);
        return;
      }

      setResult(data.message);
      onKill?.();
    } catch {
      setResult("Network error");
    } finally {
      setLoading(false);
    }
  }, [onKill]);

  return (
    <div>
      <button
        onClick={() => (hasLiveStrategies ? setShowConfirm(true) : null)}
        disabled={loading || !hasLiveStrategies}
        className={`
          flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all
          ${
            hasLiveStrategies
              ? "bg-red-600 text-white hover:bg-red-500 shadow-lg shadow-red-900/30 cursor-pointer"
              : "bg-slate-800 text-slate-500 cursor-not-allowed"
          }
          ${loading ? "opacity-50 cursor-wait" : ""}
        `}
        aria-label="Emergency kill switch - stop all live trading"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
            clipRule="evenodd"
          />
        </svg>
        Kill Switch
      </button>

      {result && (
        <p className="mt-2 text-xs text-slate-400">{result}</p>
      )}

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-red-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-red-400">
              Emergency Stop
            </h3>
            <p className="mt-2 text-sm text-slate-400">
              This will immediately switch <strong className="text-white">all strategies</strong> to
              paper trading mode. No new live orders will be placed. Existing
              open positions are not affected.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleKill}
                disabled={loading}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 transition-colors disabled:opacity-50"
              >
                {loading ? "Stopping..." : "Confirm Stop"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
