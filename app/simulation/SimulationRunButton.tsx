"use client";

import { Play } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function SimulationRunButton() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    const windowParam = searchParams.get("window") ?? "24h";
    try {
      await fetch(`/api/simulation/run?window=${encodeURIComponent(windowParam)}`, {
        method: "POST"
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      className="inline-flex h-10 items-center justify-center gap-2 rounded border border-emerald-400/50 bg-emerald-400/10 px-4 text-sm font-medium text-emerald-100 hover:bg-emerald-400/20 disabled:cursor-wait disabled:opacity-60"
      disabled={loading}
      onClick={() => void run()}
      type="button"
    >
      <Play className="h-4 w-4" />
      运行模拟
    </button>
  );
}
