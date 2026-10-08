"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

interface ThemeToggleProps {
  /** "switch" renders a labelled "Dark mode" row with a switch, for the dashboard sidebar. */
  variant?: "icon" | "switch";
  /** Row classes for the switch variant. */
  className?: string;
}

export default function ThemeToggle({ variant = "icon", className = "" }: ThemeToggleProps) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleTheme() {
    const nextIsDark = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", nextIsDark);
    setIsDark(nextIsDark);

    try {
      localStorage.setItem("taskwell-theme", nextIsDark ? "dark" : "light");
    } catch {
      // The current page theme still changes when storage is unavailable.
    }
  }

  if (variant === "switch") {
    return (
      <button type="button" role="switch" aria-checked={isDark} onClick={toggleTheme} className={className}>
        <Moon aria-hidden="true" className="h-5 w-5 shrink-0" />
        Dark mode
        <span
          aria-hidden="true"
          className="ml-auto inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-ink/15 p-0.5 dark:bg-brand"
        >
          <span className="h-4 w-4 rounded-full bg-white shadow-sm transition-transform dark:translate-x-4 motion-reduce:transition-none" />
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-ink/15 bg-white text-ink transition-colors hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 dark:border-white/15 dark:bg-dark-surface dark:text-slate-100 dark:hover:border-brand dark:hover:text-brand dark:focus-visible:ring-offset-dark-background motion-reduce:transition-none"
    >
      <Moon aria-hidden="true" className="h-5 w-5 dark:hidden" />
      <Sun aria-hidden="true" className="hidden h-5 w-5 dark:block" />
    </button>
  );
}