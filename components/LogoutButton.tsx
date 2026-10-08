"use client";

import { signOut } from "next-auth/react";
import type { ReactNode } from "react";

interface LogoutButtonProps {
  className: string;
  children?: ReactNode;
  "aria-label"?: string;
}

export default function LogoutButton({
  className,
  children = "Log out",
  "aria-label": ariaLabel,
}: LogoutButtonProps) {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/" })}
      aria-label={ariaLabel}
      className={className}
    >
      {children}
    </button>
  );
}
