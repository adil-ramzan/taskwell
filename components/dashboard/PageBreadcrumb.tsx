"use client";

import { usePathname } from "next/navigation";

import { getNavItemForPath } from "@/lib/navigation";

export default function PageBreadcrumb() {
  const pathname = usePathname();
  const title = getNavItemForPath(pathname)?.label ?? "Dashboard";

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-2 text-sm">
        <li className="hidden text-muted dark:text-dark-muted sm:block">Workspace</li>
        <li aria-hidden="true" className="hidden text-muted/60 dark:text-dark-muted/60 sm:block">/</li>
        <li
          aria-current="page"
          className="truncate font-display text-lg font-semibold text-ink dark:text-slate-50"
        >
          {title}
        </li>
      </ol>
    </nav>
  );
}
