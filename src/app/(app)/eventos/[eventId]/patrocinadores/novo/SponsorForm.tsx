"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { LogoUploader, type UploadedLogo } from "@/components/LogoUploader";
import { ReelPreview } from "@/components/ReelPreview";
import { individualPreviewProps, type PreviewCategory } from "@/lib/preview-props";
import type { ReelEvent } from "@/remotion/types";

type LibraryCompany = { id: string; name: string; logoUrl: string | null; inThisEvent: boolean; history: { event: string; year: number; category: string | null }[] };

export function SponsorForm({
  eventId,
  reelEvent,
  categories,
  canApprove,
  maxMb,
}: {
  eventId: string;
  reelEvent: ReelEvent;
  categories: PreviewCategory[];
  canApprove: boolean;
  maxMb: number;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [company, setCompany] = useState<LibraryCompany | null>(null);
  const [suggestions, setSuggestions] = useState<LibraryCompany[]>([]);
  const [logo, setLogo] = useState<UploadedLogo | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [approveNow, setApproveNow] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Autocompletar com a biblioteca de empresas (reaproveita cadastro e logotipo)
  useEffect(() => {
    if (company || name.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/events/${eventId}/library?q=${encodeURIComponent(name.trim())}`, { signal: ctrl.signal });
        if (res.ok) setSuggestions(((await res.json()).companies as LibraryCompany[]).slice(0, 5));
      } catch {
        /* digitação rápida cancela a busca anterior */
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [name, company, eventId]);

  const category = categories.find((c) => c.id === categoryId) ?? null;
  const logoForPreview = logo?.previewUrl ?? company?.logoUrl ?? null;
  const previewProps = useMemo(
    () => (logoForPreview ? individualPreviewProps(reelEvent, { name: name.trim(), logo: logoForPreview, scale }, category) : null),
    [logoForPreview, reelEvent, name, scale, category],
  );

  const canSave = name.trim().length >= 2 && (logo || company?.logoUrl) && !saving;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api(`/api/events/${eventId}/sponsorships`, {
        method: "POST",
        json: {
          ...(company ? { companyId: company.id } : { companyName: name.trim() }),
          displayName: name.trim(),
          categoryId,
          assetId: logo?.assetId ?? null,
          logoScale: scale,
          approveNow: canApprove && approveNow,
        },
      });
      setDone(name.trim());
      setName("");
      setCompany(null);
      setLogo(null);
      setScale(1);
      setShowPreview(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 pb-28">
      {done ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
          <span>✔ <strong>{done}</strong> cadastrado{approveNow && canApprove ? " e aprovado" : " — aguardando aprovação"}.</span>
          <button className="text-emerald-100 underline" onClick={() => router.push(`/eventos/${eventId}/patrocinadores`)}>Ver lista</button>
        </div>
      ) : null}

      <section className="card space-y-2">
        <label className="label" htmlFor="company">1. Nome da empresa</label>
        <input
          id="company"
          className="input text-lg"
          value={name}
          autoComplete="off"
          placeholder="Ex.: Padaria Pão Quente"
          onChange={(e) => {
            setName(e.target.value);
            if (company && e.target.value !== company.name) setCompany(null);
          }}
        />
        {company ? (
          <p className="text-xs text-emerald-300">
            Empresa da biblioteca{company.history[0] ? ` · patrocinou ${company.history[0].event} ${company.history[0].year}` : ""}. O logotipo anterior será reaproveitado se você não enviar outro.
          </p>
        ) : null}
        {suggestions.length > 0 ? (
          <ul className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
            {suggestions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={s.inThisEvent}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5 disabled:opacity-50"
                  onClick={() => {
                    setCompany(s);
                    setName(s.name);
                    setSuggestions([]);
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {s.logoUrl ? <img src={s.logoUrl} alt="" className="h-8 w-12 rounded bg-white object-contain p-0.5" /> : <span className="h-8 w-12 rounded bg-white/10" />}
                  <span className="flex-1">
                    <span className="block text-sm">{s.name}</span>
                    <span className="block text-xs text-zinc-500">
                      {s.inThisEvent ? "Já cadastrada neste evento" : s.history.map((h) => `${h.event} ${h.year}`).join(", ") || "Biblioteca"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="card space-y-2">
        <div className="label">2. Logotipo {company?.logoUrl && !logo ? <span className="text-xs text-zinc-500">(opcional — já temos o da biblioteca)</span> : null}</div>
        <LogoUploader endpoint={`/api/events/${eventId}/logos`} maxMb={maxMb} value={logo} onChange={setLogo} />
      </section>

      <section className="card space-y-3">
        <div className="label">3. Categoria</div>
        <div className="grid grid-cols-2 gap-2">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoryId(c.id === categoryId ? null : c.id)}
              className={`min-h-[52px] rounded-xl border px-3 py-2 text-left text-sm font-medium transition ${
                c.id === categoryId ? "border-brand-400 bg-brand-400/15 text-brand-100" : "border-white/10 bg-white/5 hover:border-white/25"
              }`}
            >
              <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
              {c.name}
            </button>
          ))}
        </div>
      </section>

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <div className="label mb-0">4. Prévia no telão</div>
          <button type="button" className="btn-ghost min-h-[36px] text-xs" disabled={!previewProps} onClick={() => setShowPreview((v) => !v)}>
            {showPreview ? "Ocultar" : "Mostrar prévia"}
          </button>
        </div>
        {showPreview && previewProps ? <ReelPreview props={previewProps} /> : null}
        {!previewProps ? <p className="text-sm text-zinc-500">Envie o logotipo para ver como ficará no telão.</p> : null}
        <div>
          <label className="label text-xs">Ajuste de tamanho do logotipo: {Math.round(scale * 100)}%</label>
          <input type="range" min={0.5} max={1.5} step={0.05} value={scale} onChange={(e) => setScale(Number(e.target.value))} className="w-full accent-amber-400" />
        </div>
      </section>

      {canApprove ? (
        <label className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-amber-400" checked={approveNow} onChange={(e) => setApproveNow(e.target.checked)} />
          Já aprovar este cadastro
        </label>
      ) : null}

      {error ? <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#09090f]/95 p-4 backdrop-blur">
        <div className="mx-auto max-w-xl">
          <button className="btn-primary w-full py-4 text-base" disabled={!canSave} onClick={save}>
            {saving ? "Salvando…" : "Salvar patrocinador"}
          </button>
        </div>
      </div>
    </div>
  );
}
