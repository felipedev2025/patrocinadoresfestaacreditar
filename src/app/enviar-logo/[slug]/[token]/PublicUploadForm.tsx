"use client";

import { useState } from "react";
import { LogoUploader, type UploadedLogo } from "@/components/LogoUploader";
import { api } from "@/lib/client";

export function PublicUploadForm({ slug, token, maxMb }: { slug: string; token: string; maxMb: number }) {
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [logo, setLogo] = useState<UploadedLogo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const base = `/api/public/upload/${slug}/${token}`;

  if (done) {
    return (
      <div className="card text-center">
        <div className="text-4xl">✔</div>
        <div className="mt-2 text-lg font-semibold">Recebemos o seu logotipo!</div>
        <p className="mt-2 text-sm text-zinc-400">A organização vai conferir o material antes de exibi-lo no telão. Muito obrigado por apoiar o evento.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <div>
          <label className="label">Nome da empresa *</label>
          <input className="input text-lg" value={companyName} onChange={(e) => setCompanyName(e.target.value)} maxLength={120} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className="label">Seu nome</label><input className="input" value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={100} /></div>
          <div><label className="label">E-mail</label><input className="input" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} maxLength={160} /></div>
        </div>
        <input tabIndex={-1} autoComplete="off" className="hidden" value={website} onChange={(e) => setWebsite(e.target.value)} aria-hidden />
      </section>
      <section className="card">
        <div className="label">Logotipo *</div>
        <LogoUploader endpoint={`${base}/logo`} maxMb={maxMb} value={logo} onChange={setLogo} />
        <p className="mt-3 text-xs text-zinc-500">Prefira a versão em PNG com fundo transparente ou SVG. Confira a prévia acima antes de enviar.</p>
      </section>
      {error ? <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}
      <button
        className="btn-primary w-full py-4 text-base"
        disabled={busy || companyName.trim().length < 2 || !logo}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await api(base, { method: "POST", json: { companyName: companyName.trim(), contactName: contactName || null, contactEmail: contactEmail || null, assetId: logo!.assetId, website } });
            setDone(true);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Enviando…" : "Confirmar envio"}
      </button>
    </div>
  );
}
