"use client";

import { useFormStatus } from "react-dom";
import { useEffect, useState, useRef } from "react";

export default function SaveButton() {
  const { pending } = useFormStatus();
  const [saved, setSaved] = useState(false);
  const prevPending = useRef(false);

  useEffect(() => {
    // Detect transition from pending → not pending (submission completed)
    if (prevPending.current && !pending) {
      setSaved(true);
      const timer = setTimeout(() => setSaved(false), 3000);
      return () => clearTimeout(timer);
    }
    prevPending.current = pending;
  }, [pending]);

  return (
    <div className="flex items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {pending ? "Saving..." : "Save Settings"}
      </button>
      {saved && (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-400 animate-in fade-in duration-200">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
          </svg>
          Settings saved
        </span>
      )}
    </div>
  );
}
