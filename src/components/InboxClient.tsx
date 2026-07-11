"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_BUCKETS } from "@/lib/buckets";
import type { Thread, Classification } from "@/lib/types";
import type { PipelineStats } from "@/lib/pipeline";
import { BucketColumn } from "./BucketColumn";

type LoadState = "loading" | "ready" | "error";
const UNCLASSIFIED = "Unclassified";

interface ThreadsResponse {
  threads: Thread[];
  error?: string;
}
interface ClassifyResponse {
  classifications: Classification[];
  stats: PipelineStats;
  error?: string;
}

export function InboxClient() {
  const [state, setState] = useState<LoadState>("loading");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [classifications, setClassifications] = useState<Classification[]>([]);
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false) => {
    try {
      const tRes = await fetch(`/api/threads${refresh ? "?refresh=1" : ""}`);
      const tData: ThreadsResponse = await tRes.json();
      if (!tRes.ok) throw new Error(tData.error ?? "Failed to load threads");

      const cRes = await fetch("/api/classify");
      const cData: ClassifyResponse = await cRes.json();
      if (!cRes.ok) throw new Error(cData.error ?? "Failed to classify");

      setThreads(tData.threads);
      setClassifications(cData.classifications);
      setStats(cData.stats);
      setState("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setState("error");
    }
  }, []);

  useEffect(() => {
    // Intentional on-mount data fetch (React's sanctioned effect use case);
    // state is set after awaits, not synchronously during the effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // User-triggered reloads reset to the loading state before refetching.
  const refresh = () => {
    setState("loading");
    setError("");
    load(true);
  };
  const retry = () => {
    setState("loading");
    setError("");
    load();
  };

  // Group threads by their classified bucket.
  const bucketOf = new Map(classifications.map((c) => [c.threadId, c.bucket]));
  const grouped = new Map<string, Thread[]>();
  for (const t of threads) {
    const bucket = bucketOf.get(t.id) ?? UNCLASSIFIED;
    const list = grouped.get(bucket) ?? [];
    list.push(t);
    grouped.set(bucket, list);
  }
  const unclassified = grouped.get(UNCLASSIFIED) ?? [];

  return (
    <div className="flex flex-1 flex-col">
      <Toolbar
        state={state}
        count={threads.length}
        stats={stats}
        onRefresh={refresh}
      />

      {state === "error" ? (
        <ErrorState message={error} onRetry={retry} />
      ) : (
        <div className="flex flex-1 gap-4 overflow-x-auto p-4">
          {state === "loading"
            ? DEFAULT_BUCKETS.map((b) => <SkeletonColumn key={b.name} name={b.name} />)
            : [
                ...DEFAULT_BUCKETS.map((b) => (
                  <BucketColumn
                    key={b.name}
                    name={b.name}
                    threads={grouped.get(b.name) ?? []}
                  />
                )),
                unclassified.length > 0 && (
                  <BucketColumn
                    key={UNCLASSIFIED}
                    name={UNCLASSIFIED}
                    threads={unclassified}
                  />
                ),
              ]}
        </div>
      )}
    </div>
  );
}

function Toolbar({
  state,
  count,
  stats,
  onRefresh,
}: {
  state: LoadState;
  count: number;
  stats: PipelineStats | null;
  onRefresh: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-2.5">
      <p className="text-sm text-zinc-500">
        {state === "loading" && "Classifying your inbox…"}
        {state === "ready" &&
          stats &&
          `${count} emails · ${stats.firstPassCalls + stats.escalationCalls} model calls · ${(
            stats.durationMs / 1000
          ).toFixed(1)}s${stats.escalatedThreads > 0 ? ` · ${stats.escalatedThreads} escalated` : ""}`}
        {state === "error" && "Couldn't load your inbox"}
      </p>
      <button
        type="button"
        onClick={onRefresh}
        disabled={state === "loading"}
        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50"
      >
        {state === "loading" ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );
}

function SkeletonColumn({ name }: { name: string }) {
  return (
    <section className="flex w-80 shrink-0 flex-col rounded-xl bg-zinc-100/70">
      <header className="px-3 py-2.5">
        <h2 className="text-sm font-semibold text-zinc-400">{name}</h2>
      </header>
      <div className="flex flex-col gap-2 px-3 pb-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-lg border border-zinc-200 bg-white"
          />
        ))}
      </div>
    </section>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-sm text-zinc-600">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
      >
        Try again
      </button>
    </div>
  );
}
