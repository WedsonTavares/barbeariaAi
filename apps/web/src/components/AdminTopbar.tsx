import { UserButton } from "@clerk/nextjs";
import { AvisosAoVivo } from "./AvisosAoVivo";

/**
 * Barra superior do painel: avisos ao vivo (mensagens sem ler + notificações) +
 * conta. Fica fixa no topo à direita, como num CRM.
 *
 * O contador do servidor entra como valor INICIAL: o `AvisosAoVivo` assume
 * daí em diante e atualiza sozinho, porque antes o número só mudava quando a
 * página inteira recarregava.
 *
 * NÃO existe seletor de organização aqui, de propósito (removido em 11/08/2026):
 *
 *  - Ele contradizia o roteamento. A empresa vem do SUBDOMÍNIO
 *    (`getTenantByHost`), não da organização ativa do Clerk. Trocar de
 *    organização no seletor não trocava a empresa exibida — só criava um
 *    descompasso entre a sessão e o host.
 *  - Era redundante: `withMembership` (lib/tenant.ts) já resolve o papel do
 *    usuário na empresa do host, sozinho e sem clique.
 *  - Listava organizações de OUTROS produtos da mesma conta Clerk.
 *  - E oferecia "Create organization" ao dono da loja — que dispara o webhook
 *    `organization.created` e CRIA UM TENANT no nosso banco.
 *
 * ⚠️ Tirar o componente esconde o botão, mas a API do Clerk continua aceitando.
 *    A trava de verdade é no painel do Clerk: Organizations → desligar a
 *    permissão de usuários criarem organizações.
 *
 * O `UserButton` FICA: é por ele que o dono troca a própria senha, ativa MFA,
 * encerra sessões de outros aparelhos e sai. Trocá-lo por um botão de "Sair"
 * tiraria a troca de senha self-service.
 */
export function AdminTopbar({ unreadCount = 0 }: { unreadCount?: number }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-end gap-2 border-b border-black/5 bg-white/90 px-4 backdrop-blur md:px-6">
      <AvisosAoVivo inicial={unreadCount} />
      <div className="h-6 w-px bg-black/10" />
      <UserButton />
    </header>
  );
}
