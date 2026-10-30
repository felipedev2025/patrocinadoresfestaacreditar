import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,rgba(239,181,47,0.08),transparent_50%)]">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#09090f]/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <Link href="/eventos" className="flex items-center gap-2 font-semibold">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" className="h-7 w-7" />
            <span className="hidden sm:inline">Patrocínios & Telão</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/eventos" className="btn-ghost min-h-[36px] px-3 py-1.5">Eventos</Link>
            {user.role === "SUPER_ADMIN" ? <Link href="/usuarios" className="btn-ghost min-h-[36px] px-3 py-1.5">Usuários</Link> : null}
            <span className="ml-2 hidden max-w-[160px] truncate text-zinc-400 md:inline">{user.name}</span>
            <LogoutButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}
