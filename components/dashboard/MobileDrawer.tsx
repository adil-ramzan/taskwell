"use client";

import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";


const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface MobileDrawerProps {
  /** The sidebar shown inside the drawer. */
  children: ReactNode;
}

export default function MobileDrawer({ children }: MobileDrawerProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  // Where focus goes on close: back to the trigger, or to new page content after navigating.
  const returnFocusTo = useRef<"trigger" | "main">("trigger");

  const close = useCallback((focusTarget: "trigger" | "main" = "trigger") => {
    returnFocusTo.current = focusTarget;
    setOpen(false);
  }, []);

  // Close after any route change (link click, back/forward).
  useEffect(() => {
    close("main");
  }, [pathname, close]);

  useEffect(() => {
    if (!open) {
      if (wasOpen.current) {
        wasOpen.current = false;
        const target =
          returnFocusTo.current === "main"
            ? document.getElementById("main-content")
            : triggerRef.current;
        target?.focus();
      }
      return;
    }

    wasOpen.current = true;
    const shell = document.getElementById("dashboard-shell");
    const previousOverflow = document.body.style.overflow;

    shell?.setAttribute("inert", "");
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      // A create dialog opened from the drawer handles its own Escape and focus trap.
      if (panelRef.current?.querySelector("dialog[open]")) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        close("trigger");
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) {
        return;
      }

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((element) => !element.closest("dialog"));

      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !panelRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panelRef.current.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    }

    // The drawer is hidden from lg up; don't leave the page inert if the viewport grows.
    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    function handleViewportChange(event: MediaQueryListEvent) {
      if (event.matches) {
        close("main");
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    desktopQuery.addEventListener("change", handleViewportChange);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      desktopQuery.removeEventListener("change", handleViewportChange);
      shell?.removeAttribute("inert");
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        aria-expanded={open}
        aria-controls="mobile-navigation"
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-ink/15 bg-white text-ink hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-white/15 dark:bg-dark-surface dark:text-slate-100 lg:hidden"
      >
        <Menu aria-hidden="true" className="h-5 w-5" />
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              aria-hidden="true"
              onClick={() => close("trigger")}
              className="absolute inset-0 bg-ink/50 dark:bg-black/60"
            />
            <div
              ref={panelRef}
              id="mobile-navigation"
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
              className="absolute inset-y-0 left-0 w-[260px] max-w-[85vw] border-r border-ink/10 bg-white shadow-xl dark:border-white/10 dark:bg-dark-surface"
            >
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => close("trigger")}
                aria-label="Close navigation menu"
                className="absolute right-3 top-2.5 z-10 inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-dark-muted dark:hover:bg-white/5 dark:hover:text-slate-50"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
              {children}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
