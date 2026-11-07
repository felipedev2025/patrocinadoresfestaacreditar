"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { api } from "@/lib/client";
import { Badge, LogoThumb, SponsorStatusBadge } from "@/components/ui";
import type { SlotStatus, SponsorshipStatus } from "@prisma/client";

type Slot = {
  id: string;
  order: number;
  listName: string;
  seller: string | null;
  quotaValue: string | null;
  paymentMethod: string | null;
  notes: string | null;
  status: SlotStatus;
  matchConfidence: number | null;
  sponsorship: { id: string; displayName: string; status: SponsorshipStatus; logoUrl: string | null } | null;
  pendingAsset: { id: string; url: string | null; originalName: string | null } | null;
};
type PanelItem = { id: string; displayName: string; status: SponsorshipStatus; category: string | null; logoUrl: string | null };
type Unidentified = { id: string; url: string | null; originalName: string | null };
type Data = {
  list: { id: string; name: string; source: string; createdAt: string; createdBy: string | null };
  counts: { total: number; withLogo: number; suggested: number; ignored: number };
  slots: Slot[];
  panel: PanelItem[];
  unidentified: Unidentified[];
  canManage: boolean;
  canApprove: boolean;
};
type UploadResult = {
  name: string;
  outcome: "linked" | "suggested" | "unidentified" | "error";
  detail: string;
};

const MAX_BATCH = 50;
const FILTERS = [
  ["all", "Todas"],
  ["missing", "Faltam"],
  ["suggested", "Sugeridas"],
  ["ok", "OK"],
  ["ignored", "Ignoradas"],
] as const;

function slotState(s: Slot): "ok" | "suggested" | "missing" | "ignored" {
  if (s.status === "IGNORED") return "ignored";
  if (s.status === "LINKED" && s.sponsorship?.logoUrl) return "ok";
  if (s.status === "SUGGESTED" || s.pendingAsset) return "suggested";
  return "missing";
}

const money = (v: string | null) => (v ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—");

export function Conference({ listId, eventId, maxMb, aiEnabled }: { listId: string; eventId: string; maxMb: number; aiEnabled: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [error, setError] = useState<string | null>(null);
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [editing, setEditing] = useState<Slot | null>(null);
  const [linking, setLinking] = useState<Slot | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<Data>(`/api/lists/${listId}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [listId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function slotAction(slotId: string, body: Record<string, unknown>) {
    setBusySlot(slotId);
    setError(null);
    try {
      await api(`/api/slots/${slotId}`, { method: "PATCH", json: body });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusySlot(null);
    }
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }));
  function onDragEnd(e: DragEndEvent) {
    const assetId = String(e.active.id).replace(/^asset:/, "");
    const slotId = e.over ? String(e.over.id).replace(/^slot:/, "") : null;
    if (slotId) void slotAction(slotId, { action: "attach", assetId });
  }

  const visible = useMemo(() => (data ? data.slots.filter((s) => filter === "all" || slotState(s) === filter) : []), [data, filter]);
  if (!data) return error ? <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : <p className="text-sm text-zinc-500">Carregando conferência…</p>;

  const { counts } = data;
  const pct = counts.total ? Math.round((counts.withLogo / counts.total) * 100) : 0;
  const missing = data.slots.filter((s) => slotState(s) === "missing");
  const openSlots = data.slots.filter((s) => slotState(s) !== "ok" && s.status !== "IGNORED");

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="space-y-6">
        {/* Resumo */}
        <section className="card space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-sm text-zinc-400">{data.list.name}</div>
              <div className="mt-1 text-3xl font-bold tabular-nums">
                <span className={pct === 100 ? "text-emerald-300" : "text-brand-300"}>{counts.withLogo}</span> de {counts.total} com logo
              </div>
              <div className="mt-1 text-sm text-zinc-400">
                {missing.length} faltando · {counts.suggested} sugerida(s) para confirmar · {data.panel.length} só no painel
                {counts.ignored ? ` · ${counts.ignored} ignorada(s)` : ""}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <a className="btn-secondary" href={`/api/lists/${listId}/export`}>⬇ Exportar Excel</a>
              {data.canManage && data.canApprove ? (
                <button
                  className="btn-primary"
                  onClick={async () => {
                    try {
                      const r = await api<{ approved: number }>(`/api/lists/${listId}/approve-linked`, { method: "POST" });
                      alert(`${r.approved} patrocinador(es) aprovado(s).`);
                      await load();
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Aprovar todos os vinculados
                </button>
              ) : null}
            </div>
          </div>
          <div className="h-2 rounded-full bg-white/5">
            <div className="h-2 rounded-full bg-brand-400 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </section>

        {data.canManage ? <BulkUploader listId={listId} maxMb={maxMb} aiEnabled={aiEnabled} onFinished={load} /> : null}

        {error ? <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}

        {/* Não identificadas */}
        {data.canManage && data.unidentified.length > 0 ? (
          <section className="card space-y-3 border-amber-400/30">
            <div>
              <h3 className="font-semibold">Não identificadas ({data.unidentified.length})</h3>
              <p className="text-sm text-zinc-400">Arraste cada logo até a linha correta da lista, ou escolha a linha no menu abaixo do logo.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {data.unidentified.map((a) => (
                <UnidentifiedLogo key={a.id} asset={a} slots={openSlots} onAttach={(slotId) => slotAction(slotId, { action: "attach", assetId: a.id })} />
              ))}
            </div>
          </section>
        ) : null}

        {/* Linhas da lista */}
        <section className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map(([key, label]) => (
              <button key={key} className={`rounded-full px-3 py-1.5 text-sm ${filter === key ? "bg-brand-400 text-black" : "bg-white/5 text-zinc-300 hover:bg-white/10"}`} onClick={() => setFilter(key)}>
                {label}
              </button>
            ))}
          </div>
          <ul className="space-y-2">
            {visible.map((s) => (
              <SlotRow
                key={s.id}
                slot={s}
                busy={busySlot === s.id}
                canManage={data.canManage}
                onAction={(body) => slotAction(s.id, body)}
                onEdit={() => setEditing(s)}
                onLink={() => setLinking(s)}
                eventId={eventId}
                maxMb={maxMb}
              />
            ))}
            {visible.length === 0 ? <li className="card py-6 text-center text-sm text-zinc-500">Nenhuma linha neste filtro.</li> : null}
          </ul>
        </section>

        {/* Só no painel */}
        <section className="card space-y-3">
          <div>
            <h3 className="font-semibold">Só no painel ({data.panel.length})</h3>
            <p className="text-sm text-zinc-400">Cadastrados no evento que não estão vinculados a nenhuma linha desta lista.</p>
          </div>
          {data.panel.length === 0 ? (
            <p className="text-sm text-zinc-500">Todos os cadastrados estão na lista.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.panel.map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-xl border border-white/10 p-2">
                  <LogoThumb url={p.logoUrl} alt={p.displayName} size={44} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{p.displayName}</div>
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <SponsorStatusBadge status={p.status} /> {p.category ?? "Sem categoria"}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {editing ? <EditSlotDialog slot={editing} onClose={() => setEditing(null)} onSave={async (body) => { await slotAction(editing.id, { action: "edit", ...body }); setEditing(null); }} /> : null}
      {linking ? (
        <LinkDialog
          eventId={eventId}
          slot={linking}
          onClose={() => setLinking(null)}
          onLink={async (sponsorshipId) => {
            await slotAction(linking.id, { action: "link", sponsorshipId });
            setLinking(null);
          }}
        />
      ) : null}
    </DndContext>
  );
}

function SlotRow({
  slot: s,
  busy,
  canManage,
  onAction,
  onEdit,
  onLink,
  eventId,
  maxMb,
}: {
  slot: Slot;
  busy: boolean;
  canManage: boolean;
  onAction: (body: Record<string, unknown>) => void;
  onEdit: () => void;
  onLink: () => void;
  eventId: string;
  maxMb: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${s.id}`, disabled: !canManage || s.status === "IGNORED" });
  const fileRef = useRef<HTMLInputElement>(null);
  const state = slotState(s);
  const badge = {
    ok: <Badge className="bg-emerald-400/15 text-emerald-300 ring-emerald-400/30">OK</Badge>,
    suggested: <Badge className="bg-amber-400/15 text-amber-300 ring-amber-400/30">Sugerido</Badge>,
    missing: <Badge className="bg-red-400/15 text-red-300 ring-red-400/30">Falta</Badge>,
    ignored: <Badge className="bg-zinc-400/15 text-zinc-300 ring-zinc-400/30">Ignorado</Badge>,
  }[state];

  async function uploadSingle(f: File) {
    if (f.size > maxMb * 1048576) return alert(`Arquivo maior que ${maxMb} MB`);
    const fd = new FormData();
    fd.set("file", f);
    const res = await fetch(`/api/events/${eventId}/logos`, { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) return alert(data.error ?? "Falha no envio");
    onAction({ action: "attach", assetId: data.assetId });
  }

  return (
    <li ref={setNodeRef} className={`card flex flex-col gap-3 p-3 transition sm:flex-row sm:items-center ${isOver ? "border-brand-400 bg-brand-400/10" : ""} ${state === "ignored" ? "opacity-60" : ""}`}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="w-8 shrink-0 text-center text-lg font-bold tabular-nums text-brand-300">{s.order}</span>
        <LogoThumb url={s.sponsorship?.logoUrl ?? null} alt={s.listName} size={56} />
        {s.pendingAsset?.url ? (
          <div className="relative">
            <LogoThumb url={s.pendingAsset.url} alt="Logo sugerido" size={56} />
            <span className="absolute -right-1 -top-1 rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-black">?</span>
          </div>
        ) : null}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold">{s.listName}</span>
            {badge}
            {s.matchConfidence !== null && state === "suggested" ? <span className="text-xs text-zinc-500">{Math.round(s.matchConfidence * 100)}%</span> : null}
          </div>
          <div className="mt-0.5 text-xs text-zinc-400">
            {s.seller ? `${s.seller} · ` : ""}
            {money(s.quotaValue)}
            {s.paymentMethod ? ` · ${s.paymentMethod}` : ""}
          </div>
          {s.sponsorship ? (
            <div className="mt-0.5 text-xs text-zinc-500">
              {s.status === "SUGGESTED" ? "Sugestão: " : "No painel: "}
              <span className="text-zinc-300">{s.sponsorship.displayName}</span> <SponsorStatusBadge status={s.sponsorship.status} />
            </div>
          ) : null}
          {s.notes ? <div className="mt-0.5 truncate text-xs text-zinc-500">Obs.: {s.notes}</div> : null}
        </div>
      </div>
      {canManage ? (
        <div className="flex flex-wrap gap-2">
          {state === "suggested" ? (
            <>
              <button className="btn-primary min-h-[38px] py-1.5" disabled={busy} onClick={() => onAction({ action: "confirm" })}>Confirmar</button>
              <button className="btn-ghost min-h-[38px] py-1.5" disabled={busy} onClick={() => onAction({ action: "reject" })}>Recusar</button>
            </>
          ) : null}
          {state !== "ignored" ? (
            <>
              <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={(e) => e.target.files?.[0] && uploadSingle(e.target.files[0])} />
              <button className="btn-secondary min-h-[38px] py-1.5" disabled={busy} onClick={() => fileRef.current?.click()}>
                {s.sponsorship?.logoUrl ? "Trocar logo" : "Enviar logo"}
              </button>
              {s.status !== "LINKED" ? <button className="btn-ghost min-h-[38px] py-1.5" disabled={busy} onClick={onLink}>Vincular</button> : null}
              {s.status === "LINKED" ? <button className="btn-ghost min-h-[38px] py-1.5" disabled={busy} onClick={() => confirm("Desfazer o vínculo desta linha?") && onAction({ action: "unlink" })}>Desvincular</button> : null}
              <button className="btn-ghost min-h-[38px] py-1.5" disabled={busy} onClick={onEdit}>Editar</button>
              <button className="btn-ghost min-h-[38px] py-1.5 text-zinc-400" disabled={busy} onClick={() => onAction({ action: "ignore" })}>Ignorar</button>
            </>
          ) : (
            <button className="btn-ghost min-h-[38px] py-1.5" disabled={busy} onClick={() => onAction({ action: "restore" })}>Restaurar</button>
          )}
        </div>
      ) : null}
    </li>
  );
}

function UnidentifiedLogo({ asset, slots, onAttach }: { asset: Unidentified; slots: Slot[]; onAttach: (slotId: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `asset:${asset.id}` });
  return (
    <div className="space-y-1.5">
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50, position: "relative" } : undefined}
        className={`checker flex h-24 cursor-grab touch-none items-center justify-center rounded-xl ring-1 ring-white/10 ${isDragging ? "opacity-80 shadow-2xl ring-brand-400" : ""}`}
        title={asset.originalName ?? "Logo"}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {asset.url ? <img src={asset.url} alt={asset.originalName ?? "Logo"} className="max-h-20 max-w-[90%] object-contain" draggable={false} /> : null}
      </div>
      <div className="truncate text-[11px] text-zinc-500">{asset.originalName ?? "—"}</div>
      <select className="input px-2 py-1.5 text-xs" value="" onChange={(e) => e.target.value && onAttach(e.target.value)} aria-label="Encaixar na linha">
        <option value="">Encaixar em…</option>
        {slots.map((s) => (
          <option key={s.id} value={s.id}>
            {s.order}. {s.listName}
          </option>
        ))}
      </select>
    </div>
  );
}

function BulkUploader({ listId, maxMb, aiEnabled, onFinished }: { listId: string; maxMb: number; aiEnabled: boolean; onFinished: () => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [useOcr, setUseOcr] = useState(false);
  const [removeBg, setRemoveBg] = useState(false);

  async function run(files: File[]) {
    if (files.length > MAX_BATCH) {
      alert(`Selecione no máximo ${MAX_BATCH} arquivos por lote.`);
      return;
    }
    const out: UploadResult[] = [];
    setResults([]);
    setProgress({ done: 0, total: files.length });
    // Um arquivo por vez: mantém cada requisição pequena e evita corrida no encaixe da mesma linha
    for (const f of files) {
      if (f.size > maxMb * 1048576) {
        out.push({ name: f.name, outcome: "error", detail: `Maior que ${maxMb} MB` });
      } else {
        try {
          const fd = new FormData();
          fd.set("file", f);
          fd.set("ocr", String(useOcr));
          fd.set("removeBackground", String(removeBg));
          const res = await fetch(`/api/lists/${listId}/logos`, { method: "POST", body: fd });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Falha no envio");
          const r = data.result as { kind: string; order?: number; listName?: string; confidence?: number; best?: { listName: string; confidence: number } | null };
          const pct = (c?: number) => (c !== undefined ? ` (${Math.round(c * 100)}%)` : "");
          out.push(
            r.kind === "linked"
              ? { name: f.name, outcome: "linked", detail: `→ ${r.order}. ${r.listName}${pct(r.confidence)}${data.usedOcr ? " · lido no logo" : ""}` }
              : r.kind === "suggested"
                ? { name: f.name, outcome: "suggested", detail: `→ ${r.order}. ${r.listName}?${pct(r.confidence)} confirme na lista` }
                : { name: f.name, outcome: "unidentified", detail: r.best ? `parecido com ${r.best.listName}${pct(r.best.confidence)}` : "sem correspondência" },
          );
        } catch (e) {
          out.push({ name: f.name, outcome: "error", detail: (e as Error).message });
        }
      }
      setResults([...out]);
      setProgress({ done: out.length, total: files.length });
    }
    setProgress(null);
    await onFinished();
  }

  const icon = { linked: "✅", suggested: "🟡", unidentified: "❔", error: "⛔" };
  return (
    <section className="card space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-semibold">Enviar logos em lote</h3>
          <p className="text-sm text-zinc-400">Até {MAX_BATCH} imagens por vez. O nome do arquivo é usado para encaixar cada logo na linha certa.</p>
        </div>
        <button className="btn-primary" disabled={!!progress} onClick={() => inputRef.current?.click()}>
          {progress ? `Enviando ${progress.done}/${progress.total}…` : "Selecionar imagens"}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) void run(files);
        }}
      />
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" className="h-5 w-5 accent-amber-400" checked={removeBg} onChange={(e) => setRemoveBg(e.target.checked)} /> Remover fundo sólido
        </label>
        <label className={`flex items-center gap-2 ${aiEnabled ? "" : "opacity-50"}`} title={aiEnabled ? "" : "Leitura por IA não configurada no servidor"}>
          <input type="checkbox" className="h-5 w-5 accent-amber-400" disabled={!aiEnabled} checked={useOcr} onChange={(e) => setUseOcr(e.target.checked)} />
          Se o nome do arquivo não ajudar, ler o nome no próprio logo (IA)
        </label>
      </div>
      {progress ? (
        <div className="h-1.5 rounded-full bg-white/10">
          <div className="h-1.5 rounded-full bg-brand-400 transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
        </div>
      ) : null}
      {results.length ? (
        <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
          {results.map((r, i) => (
            <li key={i} className="flex gap-2">
              <span>{icon[r.outcome]}</span>
              <span className="truncate text-zinc-300">{r.name}</span>
              <span className="truncate text-zinc-500">{r.detail}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function EditSlotDialog({ slot, onClose, onSave }: { slot: Slot; onClose: () => void; onSave: (body: Record<string, unknown>) => Promise<void> }) {
  const [v, setV] = useState({
    listName: slot.listName,
    seller: slot.seller ?? "",
    quotaValue: slot.quotaValue ? Number(slot.quotaValue).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "",
    paymentMethod: slot.paymentMethod ?? "",
    notes: slot.notes ?? "",
  });
  const field = (k: keyof typeof v, label: string, max: number) => (
    <div>
      <label className="label">{label}</label>
      <input className="input" value={v[k]} maxLength={max} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
    </div>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-lg space-y-3 rounded-t-3xl border border-white/10 bg-[#111118] p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">Linha {slot.order}</h3>
        {field("listName", "Empresa (como na lista)", 160)}
        {field("seller", "Vendedor", 100)}
        {field("quotaValue", "Valor da cota", 30)}
        {field("paymentMethod", "Forma de pagamento", 60)}
        {field("notes", "Observação", 300)}
        <div className="flex gap-2 pt-2">
          <button className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
          <button className="btn-primary flex-1" disabled={!v.listName.trim()} onClick={() => onSave({ ...v, quotaValue: v.quotaValue || null })}>Salvar</button>
        </div>
      </div>
    </div>
  );
}

function LinkDialog({ eventId, slot, onClose, onLink }: { eventId: string; slot: Slot; onClose: () => void; onLink: (sponsorshipId: string) => Promise<void> }) {
  const [q, setQ] = useState(slot.listName.split(" ")[0] ?? "");
  const [items, setItems] = useState<{ id: string; displayName: string; status: SponsorshipStatus; logoUrl: string | null }[]>([]);
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const r = await api<{ sponsorships: { id: string; displayName: string; status: SponsorshipStatus; logoUrl: string | null }[] }>(
          `/api/events/${eventId}/sponsorships?sort=name&q=${encodeURIComponent(q.trim())}`,
        );
        setItems(r.sponsorships.slice(0, 30));
      } catch {
        setItems([]);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q, eventId]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-t-3xl border border-white/10 bg-[#111118] p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">Vincular “{slot.listName}” a um cadastro</h3>
        <input className="input" placeholder="Buscar patrocinador cadastrado…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <ul className="space-y-1">
          {items.map((i) => (
            <li key={i.id}>
              <button className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/5" onClick={() => onLink(i.id)}>
                <LogoThumb url={i.logoUrl} alt={i.displayName} size={40} />
                <span className="flex-1 truncate text-sm">{i.displayName}</span>
                <SponsorStatusBadge status={i.status} />
              </button>
            </li>
          ))}
          {items.length === 0 ? <li className="py-4 text-center text-sm text-zinc-500">Nenhum cadastro encontrado.</li> : null}
        </ul>
        <button className="btn-secondary w-full" onClick={onClose}>Fechar</button>
      </div>
    </div>
  );
}
