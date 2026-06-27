import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Diny — Locação de Brinquedos",
  description: "Plataforma multi-tenant de locação de brinquedos de festa.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="pt-BR">
        <body className="antialiased">{children}</body>
      </html>
    </ClerkProvider>
  );
}
