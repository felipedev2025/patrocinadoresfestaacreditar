"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

type Company = { id: string; name: string; logoUrl: string | null; history: { event: string; year: number; category: string | null; status: string }[] };

/** Patrocinadores de edições anteriores da mesma série que ainda não estão nesta edição. */
export function LibrarySuggestions({ eventId, categories }: { eventId: string; categories: { id: string; name: string }[] }) {
  const router = useRouter();
  const [items, setItems] = useState<Company[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [categoryId, setCategoryId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api<{ companies: Company[] }>(`/api/events/${eventId}/library?suggest=1`)
      .then((r) => setItems(r.companies))
      .catch(() => {});
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  if (items.length === 0) return null;

  async function importSelected() {
    setBusy(true);
    try {
      const r = await api<{ created: number; skipped: number }>(`/api/events/${eventId}/library`, {
        method: "POST",
        json: { companyIds: [...selected], categoryId: categoryId || null },
      });
      setMsg(`${r.created} patrocinador(es) adicionados como pendentes${r.skipped ? ` · ${r.skipped} ignorado(s)` : ""}.`);
      setSelected(new Set());
      await load();
      router.refresh();
      window.dispatchEvent(new Event("sponsors:changed"));
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mb-6 border-brand-400/30 bg-brand-400/[0.04]">
      <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen((v) => !v)}>
        <span>
          <span className="font-semibold">{items.length} patrocinador(es) de edições anteriores</span>
          <span className="block text-sm text-zinc-400">Reaproveite cadastro e logotipo. A participação precisa ser reconfirmada.</span>
        </span>
        <span className="text-brand-300">{open ? "▲" : "▼"}</span>
      </button>
      {open ? (
        <div className="mt-4 space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((c) => (
              <label key={c.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${selected.has(c.id) ? "border-brand-400 bg-brand-400/10" : "border-white/10"}`}>
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-amber-400"
                  checked={selected.has(c.id)}
                  onChange={(e) => {
                    const s = new Set(selected);
                    if (e.target.checked) s.add(c.id);
                    else s.delete(c.id);
                    setSelected(s);
                  }}
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {c.logoUrl ? <img src={c.logoUrl} alt="" className="h-10 w-14 rounded bg-white object-contain p-1" /> : <span className="h-10 w-14 rounded bg-white/10" />}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{c.name}</span>
                  <span className="block truncate text-xs text-zinc-500">{c.history.map((h) => `${h.year}${h.category ? ` · ${h.category}` : ""}`).join(" | ")}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select className="input sm:max-w-xs" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Categoria (opcional)</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button className="btn-primary" disabled={selected.size === 0 || busy} onClick={importSelected}>
              Adicionar {selected.size || ""} selecionado(s)
            </button>
            <button className="btn-ghost" onClick={() => setSelected(new Set(items.map((i) => i.id)))}>Selecionar todos</button>
          </div>
          {msg ? <p className="text-sm text-brand-200">{msg}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
