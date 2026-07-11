import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

export default async function Home() {
  const session = await auth();
  if (session) redirect("/inbox");

  return (
    <main className="flex flex-1 items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-10 text-center shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">
          Inbox Concierge
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          Sign in to triage your last 200 email threads with an LLM.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/inbox" });
          }}
          className="mt-8"
        >
          <button
            type="submit"
            className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
          >
            Sign in with Google
          </button>
        </form>
      </div>
    </main>
  );
}
