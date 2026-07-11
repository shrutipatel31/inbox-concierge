import type { Thread } from "@/lib/types";

/** Pull a human-friendly sender out of a raw `Name <email>` From header. */
function displayName(from: string): string {
  const named = from.match(/^\s*"?([^"<]+?)"?\s*</);
  if (named?.[1]) return named[1].trim();
  return from.match(/<([^>]+)>/)?.[1] ?? from;
}

export function EmailCard({ thread }: { thread: Thread }) {
  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm">
      <div className="truncate text-xs font-medium text-zinc-500">
        {displayName(thread.from)}
      </div>
      <div className="mt-0.5 truncate text-sm font-semibold text-zinc-900">
        {thread.subject || "(no subject)"}
      </div>
      <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{thread.snippet}</p>
    </article>
  );
}
