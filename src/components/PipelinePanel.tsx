import type { PipelineStats } from "@/lib/pipeline";

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between gap-6 py-1">
      <span className="text-zinc-500">{label}</span>
      <span className="font-medium text-zinc-800">{value}</span>
    </div>
  );
}

export function PipelinePanel({
  stats,
  onClose,
}: {
  stats: PipelineStats;
  onClose: () => void;
}) {
  const calls = stats.firstPassCalls + stats.escalationCalls;

  return (
    <div className="fixed bottom-4 right-4 z-10 w-72 rounded-xl border border-zinc-200 bg-white p-4 text-xs shadow-xl">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900">Pipeline</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-700"
          aria-label="Close pipeline panel"
        >
          ✕
        </button>
      </div>

      <p className="mt-2 rounded-lg bg-zinc-100 px-3 py-2 text-zinc-700">
        <span className="font-semibold text-zinc-900">{calls} model calls</span>{" "}
        for {stats.totalThreads} emails
        <span className="text-zinc-400">
          {" "}
          (vs {stats.totalThreads} unbatched)
        </span>
      </p>

      <div className="mt-3">
        <Row label="Batches (first pass)" value={stats.firstPassCalls} />
        <Row label="Escalated → strong model" value={stats.escalatedThreads} />
        <Row label="Escalation calls" value={stats.escalationCalls} />
        <Row label="Retries (backoff)" value={stats.retries} />
        <Row label="Failed threads" value={stats.failedThreads} />
        <Row label="Cached tokens" value={stats.cachedTokens} />
        <Row label="Total tokens" value={stats.totalTokens.toLocaleString()} />
        <Row
          label="Duration"
          value={`${(stats.durationMs / 1000).toFixed(1)}s`}
        />
      </div>
    </div>
  );
}
