import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Patrocínios & Telão", template: "%s · Patrocínios & Telão" },
  description: "Gestão de patrocinadores e geração automática de vídeos para telões de eventos.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { themeColor: "#09090f", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
