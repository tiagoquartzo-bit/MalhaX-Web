import type { Metadata } from "next";
import "@fontsource-variable/inter/wght.css";
import "./globals.css";
import "leaflet/dist/leaflet.css";

export const metadata: Metadata = {
  title: "MalhaX · Logística e tecnologia",
  description: "Gestão de coletas, entregas e operações logísticas.",
  icons: { icon: "/malhax-symbol.svg", apple: "/malhax-symbol.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

