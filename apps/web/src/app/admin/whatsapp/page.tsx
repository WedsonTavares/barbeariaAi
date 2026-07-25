import { redirect } from "next/navigation";

/** A conexão do WhatsApp virou uma seção de Configurações. Mantido p/ links antigos. */
export default function WhatsappPage() {
  redirect("/admin/configuracoes");
}
