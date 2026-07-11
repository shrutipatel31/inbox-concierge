"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DEFAULT_BUCKETS, type Bucket } from "@/lib/buckets";
import type { Thread, Classification } from "@/lib/types";
import { BucketColumn } from "./BucketColumn";
import { AddBucketModal } from "./AddBucketModal";

type LoadState = "loading" | "ready" | "error";
const UNCLASSIFIED = "Unclassified";

interface ThreadsResponse {
  threads: Thread[];
  error?: string;
}
interface ClassifyResponse {
  classifications: Classification[];
  buckets: Bucket[];
  error?: string;
}

export function InboxClient() {
  const [state, setState] = useState<LoadState>("loading");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [classifications, setClassifications] = useState<Classification[]>([]);
  const [buckets, setBuckets] = useState<Bucket[]>(DEFAULT_BUCKETS);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  // Fetch classifications; serves the server cache unless `rerun` forces a
  // fresh pipeline run (after a Gmail refresh or a new bucket).
  const classify = useCallback(async (rerun = false) => {
    const cRes = await fetch(`/api/classify${rerun ? "?rerun=1" : ""}`);
    const cData: ClassifyResponse = await cRes.json();
    if (!cRes.ok) throw new Error(cData.error ?? "Failed to classify");
    setClassifications(cData.classifications);
    setBuckets(cData.buckets);
    setState("ready");
  }, []);

  const load = useCallback(
    async (refresh = false) => {
      try {
        const tRes = await fetch(`/api/threads${refresh ? "?refresh=1" : ""}`);
        const tData: ThreadsResponse = await tRes.json();
        if (!tRes.ok) throw new Error(tData.error ?? "Failed to load threads");
        setThreads(tData.threads);
        await classify(refresh);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
        setState("error");
      }
    },
    [classify],
  );

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

  // A new bucket is already saved server-side; re-run classification over the
  // cached threads with the updated bucket set.
  const onBucketAdded = (updated: Bucket[]) => {
    setBuckets(updated);
    setModalOpen(false);
    setState("loading");
    classify(true).catch((e) => {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setState("error");
    });
  };

  // Group threads by their classified bucket.
  const classById = new Map(classifications.map((c) => [c.threadId, c]));
  const grouped = new Map<string, Thread[]>();
  for (const t of threads) {
    const bucket = classById.get(t.id)?.bucket ?? UNCLASSIFIED;
    const list = grouped.get(bucket) ?? [];
    list.push(t);
    grouped.set(bucket, list);
  }
  const unclassified = grouped.get(UNCLASSIFIED) ?? [];

  return (
    <div className="flex flex-1 flex-col">
      <Toolbar
        state={state}
        onRefresh={refresh}
        onAddBucket={() => setModalOpen(true)}
      />

      {state === "error" ? (
        <ErrorState message={error} onRetry={retry} />
      ) : state === "ready" && threads.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-8">
          <p className="text-sm text-zinc-500">
            No emails found in this account.
          </p>
        </div>
      ) : (
        <div className="flex flex-1 gap-4 overflow-x-auto p-4">
          {state === "loading"
            ? buckets.map((b) => <SkeletonColumn key={b.name} name={b.name} />)
            : [
                ...buckets.map((b) => (
                  <BucketColumn
                    key={b.name}
                    name={b.name}
                    threads={grouped.get(b.name) ?? []}
                    classById={classById}
                  />
                )),
                unclassified.length > 0 && (
                  <BucketColumn
                    key={UNCLASSIFIED}
                    name={UNCLASSIFIED}
                    threads={unclassified}
                    classById={classById}
                  />
                ),
              ]}
        </div>
      )}

      {modalOpen && (
        <AddBucketModal
          onClose={() => setModalOpen(false)}
          onAdded={onBucketAdded}
        />
      )}
    </div>
  );
}

function Toolbar({
  state,
  onRefresh,
  onAddBucket,
}: {
  state: LoadState;
  onRefresh: () => void;
  onAddBucket: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-white px-4 py-2.5">
      <p className="min-w-0 truncate text-sm text-zinc-500">
        {state === "loading" && "Classifying your inbox…"}
        {state === "error" && "Couldn't load your inbox"}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onAddBucket}
          disabled={state !== "ready"}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50"
        >
          Add bucket
        </button>
        <button
          type="button"
          onClick={onRefresh}
          disabled={state === "loading"}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50"
        >
          {state === "loading" ? "Refreshing…" : "Refresh"}
        </button>
      </div>
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
  const needsAuth = /sign in|authenticat/i.test(message);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-sm text-zinc-600">{message}</p>
      {needsAuth ? (
        <Link
          href="/"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Go to sign in
        </Link>
      ) : (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Try again
        </button>
      )}
    </div>
  );
}
