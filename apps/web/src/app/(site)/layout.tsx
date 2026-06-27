import { Analytics } from "@vercel/analytics/next";

/**
 * Layout do site público (grupo de rotas `(site)`).
 * O <Analytics/> fica aqui — e NÃO no root layout — pra contabilizar apenas
 * a landing pública por tenant, sem rastrear o /admin ou /super-admin.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Analytics />
    </>
  );
}
