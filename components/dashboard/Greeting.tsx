"use client";

import { useEffect, useState } from "react";

function greetingForHour(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function Greeting({ name }: { name: string }) {
  // Server and first client render match; the local-time greeting is applied after hydration.
  const [greeting, setGreeting] = useState("Welcome back");

  useEffect(() => {
    setGreeting(greetingForHour(new Date().getHours()));
  }, []);

  const firstName = name.split(/\s+/)[0] || name;

  return (
    <h1 className="font-display text-2xl font-bold text-ink dark:text-slate-50 sm:text-3xl">
      {greeting}, <span className="break-all sm:break-normal">{firstName}</span>
    </h1>
  );
}
