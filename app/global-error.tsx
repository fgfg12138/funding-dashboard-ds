"use client";

import { useEffect } from "react";

export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  const isChunkLoadError = /ChunkLoadError|Loading chunk|loading chunk|failed to fetch dynamically imported module/i.test(
    `${error.name} ${error.message}`
  );

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="zh-CN">
      <body className="m-0 bg-[#060914] text-slate-100">
        <main className="flex min-h-screen items-center justify-center px-4">
          <section className="max-w-lg border border-slate-800 bg-slate-950 p-6">
            <p className="text-xs uppercase tracking-[0.18em] text-red-300">页面错误</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">
              {isChunkLoadError ? "页面资源加载失败，请刷新页面。" : "页面加载失败"}
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              {isChunkLoadError ? "通常是浏览器缓存了旧资源，重新加载后会获取最新页面文件。" : error.message}
            </p>
            <button
              className="mt-5 border border-cyan-400/50 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-400/20"
              onClick={() => window.location.reload()}
              type="button"
            >
              重新加载页面
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
