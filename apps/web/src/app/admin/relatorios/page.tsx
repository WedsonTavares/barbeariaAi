import { redirect } from "next/navigation";

/** Relatórios foram unificados na aba Financeiro. Mantido para não quebrar links antigos. */
export default function RelatoriosPage() {
  redirect("/admin/financeiro");
}
