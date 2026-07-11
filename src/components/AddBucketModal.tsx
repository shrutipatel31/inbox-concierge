"use client";

import { useState } from "react";
import type { Bucket } from "@/lib/buckets";

export function AddBucketModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (buckets: Bucket[]) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/buckets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description.trim() || undefined,
        }),
      });
      const data: { buckets?: Bucket[]; error?: string } = await res.json();
      if (!res.ok || !data.buckets) {
        throw new Error(data.error ?? "Failed to add bucket");
      }
      onAdded(data.buckets);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add bucket");
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2 className="text-lg font-semibold text-zinc-900">Add a bucket</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Leave the description blank and we&apos;ll generate one for you.
        </p>

        <label className="mt-4 block text-sm font-medium text-zinc-700">
          Name
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Receipts"
            maxLength={40}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500"
          />
        </label>

        <label className="mt-3 block text-sm font-medium text-zinc-700">
          Description <span className="text-zinc-400">(optional)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Anything about invoices, receipts, or payments"
            rows={3}
            maxLength={240}
            className="mt-1 w-full resize-none rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500"
          />
        </label>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {submitting ? "Adding…" : "Add bucket"}
          </button>
        </div>
      </form>
    </div>
  );
}
