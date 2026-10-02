"use client";

import { signOut } from "next-auth/react";

interface LogoutButtonProps {
  className: string;
}

export default function LogoutButton({ className }: LogoutButtonProps) {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/" })}
      className={className}
    >
      Log out
    </button>
  );
}