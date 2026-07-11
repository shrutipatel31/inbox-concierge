import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";

export default async function InboxPage() {
  const session = await auth();
  if (!session) redirect("/");

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            Inbox Concierge
          </h1>
          <p className="text-sm text-zinc-500">
            Signed in as {session.user?.email}
          </p>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
          >
            Sign out
          </button>
        </form>
      </header>

      <section className="flex flex-1 items-center justify-center px-6">
        <p className="text-sm text-zinc-500">
          {/* Temporary M1 verification: confirms the Gmail token reached the
              session so M2's Gmail fetch has what it needs. Remove in M2. */}
          Gmail access token present:{" "}
          <span className="font-mono">
            {String(Boolean(session.accessToken))}
          </span>
        </p>
      </section>
    </main>
  );
}
