import type { Thread } from "@/lib/types";
import { EmailCard } from "./EmailCard";

export function BucketColumn({
  name,
  threads,
}: {
  name: string;
  threads: Thread[];
}) {
  return (
    <section className="flex w-80 shrink-0 flex-col rounded-xl bg-zinc-100/70">
      <header className="flex items-center justify-between px-3 py-2.5">
        <h2 className="text-sm font-semibold text-zinc-800">{name}</h2>
        <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-600">
          {threads.length}
        </span>
      </header>
      <div className="flex flex-col gap-2 overflow-y-auto px-3 pb-3">
        {threads.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-zinc-400">Empty</p>
        ) : (
          threads.map((t) => <EmailCard key={t.id} thread={t} />)
        )}
      </div>
    </section>
  );
}
