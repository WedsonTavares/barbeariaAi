import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Barbearia AI",
  description: "Plataforma multi-tenant de agenda, atendimento e financeiro para barbearias.",
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
