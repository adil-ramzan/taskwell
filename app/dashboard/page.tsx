import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/auth";
import LogoutButton from "@/components/LogoutButton";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-20">
      <div className="rounded-2xl border border-ink/10 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-brand">
          Dashboard
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold text-ink">
          Welcome to Taskwell
        </h1>

        <div className="mt-6 space-y-2 text-muted">
          <p>
            <span className="font-medium text-ink">Name:</span> {session.user.name ?? "Taskwell user"}
          </p>
          <p>
            <span className="font-medium text-ink">Email:</span> {session.user.email}
          </p>
        </div>

        <div className="mt-8 rounded-xl border border-ink/10 bg-paper p-6">
          <p className="font-display text-xl font-semibold text-ink">Taskwell workspace</p>
          <p className="mt-2 text-muted">
            A simple workspace view for your team tasks, owners, and deadlines.
          </p>
        </div>

        <div className="mt-8">
          <LogoutButton className="rounded-lg border border-ink/15 bg-white px-4 py-2 font-medium text-ink transition-colors hover:border-brand hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2" />
        </div>
      </div>
    </main>
  );
}
