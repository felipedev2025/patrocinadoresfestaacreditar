import Link from "next/link";
import type { SponsorshipStatus, RenderStatus } from "@prisma/client";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-zinc-400">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({ label, value, hint, tone = "default", href }: { label: string; value: React.ReactNode; hint?: string; tone?: "default" | "warn" | "ok" | "brand"; href?: string }) {
  const toneCls = { default: "text-zinc-100", warn: "text-amber-300", ok: "text-emerald-300", brand: "text-brand-300" }[tone];
  const body = (
    <div className="card h-full transition hover:border-white/20">
      <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">{label}</div>
      <div className={`mt-2 text-3xl font-bold tabular-nums ${toneCls}`}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-zinc-500">{hint}</div> : null}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

const SPONSOR_STATUS: Record<SponsorshipStatus, [string, string]> = {
  PENDING: ["Pendente", "bg-amber-400/15 text-amber-300 ring-amber-400/30"],
  APPROVED: ["Aprovado", "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30"],
  REJECTED: ["Rejeitado", "bg-red-400/15 text-red-300 ring-red-400/30"],
  ARCHIVED: ["Arquivado", "bg-zinc-400/15 text-zinc-300 ring-zinc-400/30"],
};

const RENDER_STATUS: Record<RenderStatus, [string, string]> = {
  QUEUED: ["Na fila", "bg-sky-400/15 text-sky-300 ring-sky-400/30"],
  RENDERING: ["Renderizando", "bg-brand-400/15 text-brand-300 ring-brand-400/30"],
  COMPLETED: ["Concluído", "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30"],
  FAILED: ["Falhou", "bg-red-400/15 text-red-300 ring-red-400/30"],
  CANCELED: ["Cancelado", "bg-zinc-400/15 text-zinc-300 ring-zinc-400/30"],
};

export function Badge({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${className}`}>{children}</span>;
}

export function SponsorStatusBadge({ status }: { status: SponsorshipStatus }) {
  const [label, cls] = SPONSOR_STATUS[status];
  return <Badge className={cls}>{label}</Badge>;
}

export function RenderStatusBadge({ status }: { status: RenderStatus }) {
  const [label, cls] = RENDER_STATUS[status];
  return <Badge className={cls}>{label}</Badge>;
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 py-10 text-center">
      <div className="text-lg font-semibold">{title}</div>
      {text ? <p className="max-w-md text-sm text-zinc-400">{text}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function LogoThumb({ url, alt, size = 56 }: { url: string | null; alt: string; size?: number }) {
  return (
    <div className="checker flex shrink-0 items-center justify-center overflow-hidden rounded-xl ring-1 ring-white/10" style={{ width: size, height: size }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt} className="max-h-full max-w-full object-contain p-1.5" />
      ) : (
        <span className="text-[10px] text-zinc-500">sem logo</span>
      )}
    </div>
  );
}
