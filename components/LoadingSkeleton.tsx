/**
 * Shared loading page used by all SSR route groups.
 * Shows a minimal skeleton while the async page is resolving.
 * Imported and re-exported as `loading.tsx` in each route directory.
 */
import { Skeleton } from "./ui/dashboard";

export default function LoadingSkeleton() {
  return (
    <main className="min-h-screen bg-[#060914] px-3 py-3 text-slate-100 sm:px-5 lg:px-6">
      <div className="mx-auto max-w-[1920px] space-y-3">
        <header className="border border-slate-800 bg-slate-950/70">
          <div className="flex flex-col gap-3 border-b border-slate-800 px-4 py-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-8 w-28" />
            </div>
          </div>
        </header>
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </main>
  );
}
