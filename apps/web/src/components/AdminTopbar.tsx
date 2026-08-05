import { UserButton, OrganizationSwitcher } from "@clerk/nextjs";
import { AvisosAoVivo } from "./AvisosAoVivo";

/**
 * Barra superior do painel: avisos ao vivo (mensagens sem ler + notificações) +
 * troca de organização + conta. Fica fixa no topo à direita, como num CRM.
 *
 * O contador do servidor entra como valor INICIAL: o `AvisosAoVivo` assume
 * daí em diante e atualiza sozinho, porque antes o número só mudava quando a
 * página inteira recarregava.
 */
export function AdminTopbar({ unreadCount = 0 }: { unreadCount?: number }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-end gap-2 border-b border-black/5 bg-white/90 px-4 backdrop-blur md:px-6">
      <AvisosAoVivo inicial={unreadCount} />
      <div className="h-6 w-px bg-black/10" />
      <OrganizationSwitcher hidePersonal afterSelectOrganizationUrl="/admin/dashboard" />
      <UserButton />
    </header>
  );
}
