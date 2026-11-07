import { HttpError } from "@/lib/http";
import { resolveUploadLink } from "@/lib/services/upload-links";
import { PublicUploadForm } from "./PublicUploadForm";

export const metadata = { title: "Enviar logotipo", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PublicUploadPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  let content: React.ReactNode;
  try {
    const link = await resolveUploadLink(slug, token);
    content = (
      <>
        <div className="mb-6 text-center">
          <div className="text-xs uppercase tracking-widest" style={{ color: link.event.accentColor }}>Patrocinador</div>
          <h1 className="mt-1 text-2xl font-bold">{link.event.name} {link.event.year}</h1>
          <p className="mt-2 text-sm text-zinc-400">Envie o nome e o logotipo da sua empresa para a exibição nos telões do evento. Obrigado pelo apoio!</p>
          {link.category ? <p className="mt-1 text-xs text-zinc-500">Categoria: {link.category.name}</p> : null}
        </div>
        <PublicUploadForm slug={slug} token={token} maxMb={Number(process.env.UPLOAD_MAX_MB ?? 10)} />
      </>
    );
  } catch (e) {
    const msg = e instanceof HttpError ? e.message : "Não foi possível abrir este link.";
    content = (
      <div className="card text-center">
        <div className="text-lg font-semibold">Link indisponível</div>
        <p className="mt-2 text-sm text-zinc-400">{msg}</p>
      </div>
    );
  }
  return <main className="mx-auto min-h-screen max-w-md px-4 py-10">{content}</main>;
}
