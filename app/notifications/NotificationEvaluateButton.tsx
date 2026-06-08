"use client";

import { RefreshCw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function NotificationEvaluateButton() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);

  async function evaluate() {
    setLoading(true);
    const windowParam = searchParams.get("window") ?? "24h";
    try {
      await fetch(`/api/notifications/evaluate?window=${encodeURIComponent(windowParam)}`, {
        method: "POST"
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      className="inline-flex h-10 items-center justify-center gap-2 rounded border border-amber-400/50 bg-amber-400/10 px-4 text-sm font-medium text-amber-100 hover:bg-amber-400/20 disabled:cursor-wait disabled:opacity-60"
      disabled={loading}
      onClick={() => void evaluate()}
      type="button"
    >
      <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
      评估
    </button>
  );
}
