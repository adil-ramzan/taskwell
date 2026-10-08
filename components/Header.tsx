import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import { content } from "@/lib/content";
import LogoutButton from "./LogoutButton";
import ThemeToggle from "./ThemeToggle";

export default async function Header() {
  const session = await getServerSession(authOptions);
  // An unverifiable session (database down) still shows Dashboard / Log out rather than a misleading signed-out header.
  const isLoggedIn = !!session?.user || !!session?.unavailable;

  return (
    <header className="border-b border-ink/10 bg-paper transition-colors duration-200 dark:border-white/10 dark:bg-dark-background motion-reduce:transition-none">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4">
        <a
          href="#signup"
            className="font-display text-xl font-bold text-ink focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 dark:text-slate-50 dark:focus:ring-offset-dark-background"
        >
          Taskwell
        </a>

        <nav aria-label="Main navigation" className="ml-auto hidden md:block">
          <ul className="flex items-center gap-3 text-xs font-medium text-muted sm:gap-6 sm:text-sm dark:text-dark-muted">
            <li>
              <a
                href="#pricing"
                className="inline-flex min-h-6 items-center transition-colors hover:text-ink focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 dark:hover:text-slate-50 dark:focus:ring-offset-dark-background"
              >
                Pricing
              </a>
            </li>

            <li>
              <a
                href="#faq"
                className="inline-flex min-h-6 items-center transition-colors hover:text-ink focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 dark:hover:text-slate-50 dark:focus:ring-offset-dark-background"
              >
                FAQ
              </a>
            </li>

            {isLoggedIn ? (
              <>
                <li>
                  <a
                    href="/dashboard"
                    className="inline-flex min-h-6 items-center transition-colors hover:text-ink focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 dark:hover:text-slate-50 dark:focus:ring-offset-dark-background"
                  >
                    Dashboard
                  </a>
                </li>

                <li>
                  <LogoutButton className="whitespace-nowrap rounded-lg border border-ink/15 bg-white px-3 py-2 text-ink transition-colors hover:border-brand hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 sm:px-4 dark:border-white/15 dark:bg-dark-surface dark:text-slate-100 dark:focus:ring-offset-dark-background" />
                </li>
              </>
            ) : (
              <>
                <li>
                  <a
                    href="/login"
                    className="inline-flex min-h-6 items-center transition-colors hover:text-ink focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 dark:hover:text-slate-50 dark:focus:ring-offset-dark-background"
                  >
                    Log in
                  </a>
                </li>

                <li>
                  <a
                    href="/signup"
                    className="whitespace-nowrap rounded-lg bg-brand px-3 py-2 text-white transition-colors hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-paper sm:px-4 dark:focus:ring-offset-dark-background"
                  >
                    {content.hero.cta}
                  </a>
                </li>
              </>
            )}
          </ul>
        </nav>
        <ThemeToggle />
      </div>
    </header>
  );
}