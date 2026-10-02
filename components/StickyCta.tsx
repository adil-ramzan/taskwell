"use client";

import { useEffect, useState } from "react";

export default function StickyCta() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > 600);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-50 border-t border-ink/10 bg-white p-3 dark:border-white/10 dark:bg-dark-surface md:hidden ${
        visible ? "block" : "hidden"
      }`}
    >
      <a
        href="#signup"
        className="block w-full rounded-lg bg-brand px-5 py-3 text-center font-semibold text-white transition-colors hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-dark-surface"
      >
        Start free trial
      </a>
    </div>
  );
}