"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { LogoThumb, SponsorStatusBadge, EmptyState } from "@/components/ui";
import { LogoUploader, type UploadedLogo } from "@/components/LogoUploader";
import type { SponsorshipStatus } from "@prisma/client";

type Row = {
  id: string;
  displayName: string;
  status: SponsorshipStatus;
  source: "INTERNAL" | "PUBLIC_LINK" | "LIBRARY";
  logoScale: number;
  rejectionReason: string | null;
  notes: string | null;
  createdAt: string;
  logoUrl: string | null;
  category: { id: string; name: string } | null;
  createdBy: { id: string; name: string } | null;
  reviewedBy: { name: string } | null;
};

const SOURCE = { INTERNAL: "Captador", PUBLIC_LINK: "Link público", LIBRARY: "Biblioteca" };

export function SponsorList(props: {
  eventId: string;
  categories: { id: string; name: string }[];
  initialStatus: string;
  canReview: boolean;
  canDelete: boolean;
  currentUserId: string;
  maxMb: number;
}) {
  const { eventId, categories, canReview, canDelete, currentUserId } = props;
  const [rows, setRows] = useState<Row[] | null>(null);
  const [status, setStatus] = useState(props.initialStatus);
  const [categoryId, setCategoryId] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("createdAt");
  const [editing, setEditing] = useState<Row | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ sort });
    if (status) qs.set("status", status);
    if (categoryId) qs.set("categoryId", categoryId);
    if (q.trim()) qs.set("q", q.trim());
    try {
      const r = await api<{ sponsorships: Row[] }>(`/api/events/${eventId}/sponsorships?${qs}`);
      setRows(r.sponsorships);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [eventId, status, categoryId, q, sort]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    const h = () => void load();
    window.addEventListener("sponsors:changed", h);
    return () => window.removeEventListener("sponsors:changed", h);
  }, [load]);

  async function act(id: string, body: Record<string, unknown>) {
    setError(null);
    try {
      await api(`/api/sponsorships/${id}`, { method: "PATCH", json: body });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(r: Row) {
    if (!confirm(`Excluir definitivamente "${r.displayName}" desta edição? A empresa continua na biblioteca.`)) return;
    try {
      await api(`/api/sponsorships/${r.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-4">
        <input className="input sm:col-span-2" placeholder="Buscar por nome…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="PENDING">Pendentes</option>
          <option value="APPROVED">Aprovados</option>
          <option value="REJECTED">Rejeitados</option>
          <option value="ARCHIVED">Arquivados</option>
        </select>
        <div className="flex gap-2">
          <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Todas categorias</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Ordenação">
            <option value="createdAt">Recentes</option>
            <option value="name">A–Z</option>
          </select>
        </div>
      </div>

      {error ? <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}

      {rows === null ? (
        <p className="text-sm text-zinc-500">Carregando…</p>
      ) : rows.length === 0 ? (
        <EmptyState title="Nenhum patrocinador encontrado" text="Ajuste os filtros ou adicione um novo patrocinador." />
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const own = r.createdBy?.id === currentUserId;
            return (
              <li key={r.id} className="card flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <LogoThumb url={r.logoUrl} alt={r.displayName} size={64} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold">{r.displayName}</span>
                      <SponsorStatusBadge status={r.status} />
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-400">
                      {r.category?.name ?? <span className="text-amber-300">Sem categoria</span>} · {SOURCE[r.source]}
                      {r.createdBy ? ` · ${r.createdBy.name}` : ""} · {new Date(r.createdAt).toLocaleDateString("pt-BR")}
                    </div>
                    {r.status === "REJECTED" && r.rejectionReason ? <div className="mt-1 text-xs text-red-300">Motivo: {r.rejectionReason}</div> : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canReview && r.status === "PENDING" ? (
                    <>
                      <button className="btn-primary min-h-[40px] py-2" disabled={!r.logoUrl} title={!r.logoUrl ? "Envie o logotipo antes de aprovar" : ""} onClick={() => act(r.id, { action: "approve" })}>Aprovar</button>
                      <button
                        className="btn-danger min-h-[40px] py-2"
                        onClick={() => {
                          const reason = prompt("Motivo da rejeição (opcional):") ?? undefined;
                          void act(r.id, { action: "reject", rejectionReason: reason || null });
                        }}
                      >
                        Rejeitar
                      </button>
                    </>
                  ) : null}
                  {(canReview || own) ? <button className="btn-secondary min-h-[40px] py-2" onClick={() => setEditing(r)}>Editar</button> : null}
                  {canReview && r.status === "APPROVED" ? <button className="btn-ghost min-h-[40px] py-2" onClick={() => act(r.id, { action: "archive" })}>Arquivar</button> : null}
                  {canReview && (r.status === "ARCHIVED" || r.status === "REJECTED") ? <button className="btn-ghost min-h-[40px] py-2" onClick={() => act(r.id, { action: "restore" })}>Reabrir</button> : null}
                  {canDelete || (own && r.status === "PENDING") ? <button className="btn-ghost min-h-[40px] py-2 text-red-300" onClick={() => remove(r)}>Excluir</button> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing ? (
        <EditDialog
          row={editing}
          eventId={eventId}
          categories={categories}
          maxMb={props.maxMb}
          warnReapproval={!canReview && editing.status === "APPROVED"}
          onClose={() => setEditing(null)}
          onSave={async (body) => {
            await act(editing.id, { action: "edit", ...body });
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function EditDialog({
  row,
  eventId,
  categories,
  maxMb,
  warnReapproval,
  onClose,
  onSave,
}: {
  row: Row;
  eventId: string;
  categories: { id: string; name: string }[];
  maxMb: number;
  warnReapproval: boolean;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState(row.displayName);
  const [cat, setCat] = useState(row.category?.id ?? "");
  const [scale, setScale] = useState(row.logoScale);
  const [notes, setNotes] = useState(row.notes ?? "");
  const [logo, setLogo] = useState<UploadedLogo | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-[#111118] p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-lg font-semibold">Editar patrocinador</h3>
        <div className="space-y-4">
          <div>
            <label className="label">Nome exibido</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Categoria</label>
            <select className="input" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="">Sem categoria</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Substituir logotipo</label>
            <LogoUploader endpoint={`/api/events/${eventId}/logos`} maxMb={maxMb} value={logo} onChange={setLogo} />
          </div>
          <div>
            <label className="label">Tamanho do logotipo: {Math.round(scale * 100)}%</label>
            <input type="range" min={0.5} max={1.5} step={0.05} value={scale} onChange={(e) => setScale(Number(e.target.value))} className="w-full accent-amber-400" />
          </div>
          <div>
            <label className="label">Observações internas</label>
            <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
          </div>
          {warnReapproval ? <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-200">Este cadastro já foi aprovado: ao salvar, ele volta para aprovação.</p> : null}
        </div>
        <div className="mt-6 flex gap-2">
          <button className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
          <button
            className="btn-primary flex-1"
            disabled={busy || name.trim().length < 1}
            onClick={async () => {
              setBusy(true);
              await onSave({ displayName: name.trim(), categoryId: cat || null, logoScale: scale, notes: notes.trim() || null, ...(logo ? { assetId: logo.assetId } : {}) });
              setBusy(false);
            }}
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
