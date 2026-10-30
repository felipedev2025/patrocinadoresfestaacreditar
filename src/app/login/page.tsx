import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/eventos";
  if (await currentUser()) redirect(safeNext);
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,rgba(239,181,47,0.18),transparent_60%)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-400/15 ring-1 ring-brand-400/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" className="h-9 w-9" />
          </div>
          <h1 className="text-2xl font-bold">Patrocínios & Telão</h1>
          <p className="mt-1 text-sm text-zinc-400">Acesse para cadastrar patrocinadores e gerar vídeos.</p>
        </div>
        <LoginForm next={safeNext} />
      </div>
    </main>
  );
}
