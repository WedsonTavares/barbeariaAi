import { NextResponse } from "next/server";
import { resolveTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/**
 * Manifest do PAINEL, para instalar como app no celular.
 *
 * Fica FORA de `/admin` de propósito: o middleware do Clerk protege
 * `/admin(.*)`, e o navegador busca o manifest sem credenciais — lá dentro
 * levaria 401 e o Chrome nunca ofereceria a instalação. A proteção continua
 * valendo pro que importa: abrir o app cai em `/admin/dashboard`, que exige
 * login como sempre. O manifest em si não expõe nada além do nome do tenant,
 * que o site público já mostra.
 *
 * O `<link rel="manifest">` é declarado SÓ no layout do admin. Sem isso, um
 * cliente navegando na vitrine receberia convite pra instalar um painel que
 * ele não consegue nem abrir.
 *
 * Por tenant: cada empresa instala com o próprio nome e a própria cor.
 */
export async function GET() {
  const tenant = await resolveTenant();
  const nome = tenant?.name ?? "Diny";

  return NextResponse.json(
    {
      name: `${nome} — Painel`,
      short_name: nome.split(" ")[0] ?? "Painel",
      description: "Agenda, conversas e financeiro da locação de brinquedos.",
      // Abre direto no painel, não na vitrine.
      start_url: "/admin/dashboard",
      scope: "/admin",
      display: "standalone",
      orientation: "portrait",
      background_color: "#ffffff",
      theme_color: "#2563EB",
      lang: "pt-BR",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        // maskable: o Android recorta o ícone; esta versão tem margem pra não
        // perder a borda colorida do logo no corte.
        { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    {
      headers: {
        "content-type": "application/manifest+json; charset=utf-8",
        "cache-control": "public, max-age=3600",
      },
    }
  );
}
