import { ScreenPlayer } from "./ScreenPlayer";

export const metadata = { title: "Telão", robots: { index: false, follow: false } };

export default async function ScreenPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ k?: string }> }) {
  const { slug } = await params;
  const { k } = await searchParams;
  return <ScreenPlayer slug={slug} screenKey={k ?? ""} />;
}
