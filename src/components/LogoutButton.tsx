"use client";

import { api } from "@/lib/client";

export function LogoutButton() {
  return (
    <button
      className="btn-ghost min-h-[36px] px-3 py-1.5"
      onClick={async () => {
        await api("/api/auth/logout", { method: "POST" }).catch(() => {});
        window.location.href = "/login";
      }}
    >
      Sair
    </button>
  );
}
