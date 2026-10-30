"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function EventTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const path = usePathname();
  const active = [...tabs].sort((a, b) => b.href.length - a.href.length).find((t) => path === t.href || path.startsWith(t.href + "/"));
  return (
    <div className="-mx-4 mb-6 overflow-x-auto px-4">
      <div className="flex min-w-max gap-1 border-b border-white/10">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition ${
              active?.href === t.href ? "border-brand-400 text-brand-300" : "border-transparent text-zinc-400 hover:text-zinc-100"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
