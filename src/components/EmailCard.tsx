"use client";

import { useState } from "react";
import type { Thread, Classification } from "@/lib/types";

/** Pull a human-friendly sender out of a raw `Name <email>` From header. */
function displayName(from: string): string {
  const named = from.match(/^\s*"?([^"<]+?)"?\s*</);
  if (named?.[1]) return named[1].trim();
  return from.match(/<([^>]+)>/)?.[1] ?? from;
}

function confidenceColor(confidence: number): string {
  if (confidence >= 0.9) return "bg-green-500";
  if (confidence >= 0.6) return "bg-amber-500";
  return "bg-red-500";
}

export function EmailCard({
  thread,
  classification,
}: {
  thread: Thread;
  classification?: Classification;
}) {
  const [open, setOpen] = useState(false);

  return (
    <article
      onClick={() => classification && setOpen((o) => !o)}
      className="cursor-pointer rounded-lg border border-zinc-200 bg-white p-3 shadow-sm transition-colors hover:border-zinc-300"
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-zinc-500">
          {displayName(thread.from)}
        </span>
        {classification && (
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${confidenceColor(classification.confidence)}`}
            title={`${Math.round(classification.confidence * 100)}% confident`}
          />
        )}
      </div>
      <div className="mt-0.5 truncate text-sm font-semibold text-zinc-900">
        {thread.subject || "(no subject)"}
      </div>
      <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{thread.snippet}</p>

      {open && classification && (
        <div className="mt-2 border-t border-zinc-100 pt-2 text-xs text-zinc-500">
          <span className="font-medium text-zinc-600">Why here?</span>{" "}
          {classification.reason}
          <span className="text-zinc-400">
            {" · "}
            {Math.round(classification.confidence * 100)}% confident
          </span>
        </div>
      )}
    </article>
  );
}
