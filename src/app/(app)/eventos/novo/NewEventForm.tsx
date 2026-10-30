"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

type Prev = { id: string; name: string; year: number };

export function NewEventForm({ previous }: { previous: Prev[] }) {
  const router = useRouter();
  const [fromId, setFromId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const year = Number(fd.get("year"));
    const name = String(fd.get("name") ?? "").trim();
    const edition = String(fd.get("edition") ?? "").trim() || null;
    setLoading(true);
    setError(null);
    try {
      const res = fromId
        ? await api<{ event: { id: string } }>(`/api/events/${fromId}/duplicate`, {
            method: "POST",
            json: { name: name || undefined, year, edition, copyMembers: fd.get("copyMembers") === "on" },
          })
        : await api<{ event: { id: string } }>("/api/events", {
            method: "POST",
            json: {
              name,
              year,
              edition,
              venue: String(fd.get("venue") ?? "").trim() || null,
              startsAt: fd.get("startsAt") || null,
              endsAt: fd.get("endsAt") || null,
            },
          });
      router.push(`/eventos/${res.event.id}/configuracoes`);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card max-w-2xl space-y-5">
      {previous.length > 0 ? (
        <div>
          <label className="label">Basear em uma edição anterior (opcional)</label>
          <select className="input" value={fromId} onChange={(e) => setFromId(e.target.value)}>
            <option value="">— Começar do zero —</option>
            {previous.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.year}
              </option>
            ))}
          </select>
          {fromId ? (
            <p className="mt-2 text-xs text-zinc-400">
              Identidade visual, categorias, formatos de telão e equipe serão copiados. Os patrocinadores <strong>não</strong> são copiados:
              eles aparecem como sugestões na biblioteca e precisam ser reconfirmados.
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Nome do evento</label>
          <input name="name" className="input" placeholder="Porto Fest" required={!fromId} />
        </div>
        <div>
          <label className="label">Ano</label>
          <input name="year" type="number" className="input" defaultValue={new Date().getFullYear() + 1} min={2000} max={2100} required />
        </div>
        <div>
          <label className="label">Edição</label>
          <input name="edition" className="input" placeholder="12ª edição" />
        </div>
        {!fromId ? (
          <>
            <div className="sm:col-span-2">
              <label className="label">Local</label>
              <input name="venue" className="input" placeholder="Arena / cidade" />
            </div>
            <div>
              <label className="label">Início</label>
              <input name="startsAt" type="date" className="input" />
            </div>
            <div>
              <label className="label">Término</label>
              <input name="endsAt" type="date" className="input" />
            </div>
          </>
        ) : (
          <label className="flex items-center gap-2 text-sm text-zinc-300 sm:col-span-2">
            <input type="checkbox" name="copyMembers" defaultChecked className="h-5 w-5 accent-amber-400" /> Copiar equipe (organizadores, captadores e operadores)
          </label>
        )}
      </div>
      {error ? <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}
      <button className="btn-primary w-full sm:w-auto" disabled={loading}>
        {loading ? "Criando…" : fromId ? "Criar nova edição" : "Criar evento"}
      </button>
    </form>
  );
}
