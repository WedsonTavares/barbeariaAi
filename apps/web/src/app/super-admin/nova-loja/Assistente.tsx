"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, ExternalLink, AlertTriangle, ShieldCheck } from "lucide-react";

import { criarLojaAction } from "../actions";

/**
 * Assistente de implantação de loja.
 *
 * As etapas 1 e 3–6 acontecem FORA daqui (Clerk, painel do dono, n8n). Esta
 * tela não tenta automatizá-las: ela instrui e diz o que conferir. Só a etapa 2
 * escreve no banco — e é a única perigosa, porque um dado errado ali afeta
 * outra loja. Por isso as travas vivem no service, não no formulário.
 */
export function Assistente({ rootDomain }: { rootDomain: string }) {
  const [slug, setSlug] = useState("");
  const [criada, setCriada] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const slugFinal = criada ?? slug.trim().toLowerCase();
  const host = slugFinal ? `${slugFinal}.${rootDomain}` : `<slug>.${rootDomain}`;

  return (
    <div className="mt-6 space-y-4">
      <Etapa n={1} titulo="Criar a organização no Clerk" feita={!!criada}>
        <p>
          Cada loja é uma <strong>Organization</strong> no Clerk — é ela que separa os usuários de uma loja dos da
          outra.
        </p>
        <ol className="ml-4 list-decimal space-y-1">
          <li>
            Abra o painel do Clerk →{" "}
            <a
              href="https://dashboard.clerk.com/last-active?path=organizations"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-[var(--color-primary)]"
            >
              Organizations <ExternalLink className="size-3" />
            </a>
          </li>
          <li>
            Clique em <strong>Create organization</strong> e use o nome real da loja (é o que o dono vê).
          </li>
          <li>
            Convide o dono como <strong>admin</strong> pelo e-mail dele. Sem isso ele não consegue entrar no painel.
          </li>
          <li>
            Abra a organização criada e copie o <strong>Organization ID</strong> — começa com <code>org_</code>.
          </li>
        </ol>
        <Aviso>
          Copie o ID da organização <strong>nova</strong>. Colar o de uma loja existente é recusado na etapa 2, mas
          confira mesmo assim — é o erro mais comum aqui.
        </Aviso>
      </Etapa>

      <Etapa n={2} titulo="Cadastrar a loja no sistema" feita={!!criada} destaque={!criada}>
        {criada ? (
          <p className="flex items-center gap-2 font-semibold text-emerald-700">
            <Check className="size-4" /> Loja criada. Slug: <code>{criada}</code>
          </p>
        ) : (
          <>
            <p>Único passo que escreve no banco. O restante é conferência.</p>
            <form
              action={(fd) =>
                iniciar(async () => {
                  setErro(null);
                  const r = await criarLojaAction(fd);
                  if (r.ok) setCriada(r.slug);
                  else setErro(r.erro);
                })
              }
              className="space-y-3"
            >
              <Campo rotulo="Nome da loja" dica="Como aparece para o dono. Ex.: Barbearia do Centro">
                <input name="name" required className={INPUT} placeholder="Barbearia do Centro" />
              </Campo>

              <Campo
                rotulo="Slug"
                dica={`Vira o endereço da loja E, por padrão, o nome da instância do WhatsApp. Só minúsculas, números e hífen.`}
              >
                <input
                  name="slug"
                  required
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className={INPUT}
                  placeholder="barbearia-centro"
                />
                <span className="mt-1 block text-xs text-[var(--color-muted)]">
                  Painel: <code>{host}/admin</code>
                </span>
              </Campo>

              <Campo rotulo="Organization ID do Clerk" dica="O que você copiou na etapa 1.">
                <input name="clerkOrgId" required className={INPUT} placeholder="org_..." />
              </Campo>

              {erro && (
                <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  {erro}
                </p>
              )}

              <div className="flex items-center gap-3">
                <button disabled={pendente} className={BOTAO}>
                  {pendente ? "Criando..." : "Criar loja"}
                </button>
                <span className="flex items-center gap-1 text-xs text-[var(--color-muted)]">
                  <ShieldCheck className="size-3.5" /> recusa se colidir com outra loja
                </span>
              </div>
            </form>

            <div className="rounded-xl border border-black/10 bg-[var(--color-surface)] p-3 text-xs">
              <p className="font-bold">O que é checado antes de criar:</p>
              <ul className="ml-4 mt-1 list-disc space-y-0.5 text-[var(--color-muted)]">
                <li>slug já usado por outra loja → recusa</li>
                <li>slug reservado do sistema (evo, n8n, api, admin…) → recusa</li>
                <li>Organization ID já pertence a outra loja → recusa</li>
                <li>
                  <strong>slug igual à instância de WhatsApp de outra loja</strong> → recusa. Sem essa trava a loja nova
                  leria as mensagens da outra, e nenhuma constraint do banco pega isso.
                </li>
              </ul>
              <p className="mt-2 text-[var(--color-muted)]">
                Em qualquer colisão nada é criado. Nenhuma loja existente é alterada em hipótese alguma.
              </p>
            </div>
          </>
        )}
      </Etapa>

      <Etapa n={3} titulo="Conectar o WhatsApp da loja" destaque={!!criada}>
        <p>Quem faz é o dono, no painel dele. A instância do Evolution nasce sozinha nesse momento.</p>
        <ol className="ml-4 list-decimal space-y-1">
          <li>
            O dono entra em <code>{host}/admin</code> com o login do Clerk.
          </li>
          <li>
            Vai em <strong>Configurações → WhatsApp</strong> e pede o QR.
          </li>
          <li>
            Se ele estiver no celular, use o <strong>código de pareamento de 8 dígitos</strong> em vez do QR — não dá
            para escanear um QR na mesma tela em que ele aparece.
          </li>
        </ol>
        <Aviso>
          Um QR por vez, e escaneie na hora. Cada QR é um pedido de pareamento e o excesso faz o WhatsApp bloquear a
          vinculação por horas. O sistema já limita a 3 pedidos por 15 minutos.
        </Aviso>
        <p className="text-xs text-[var(--color-muted)]">
          O webhook da instância é configurado automaticamente, apontando para <code>{host}</code> com o segredo desta
          loja. Não precisa fazer nada manual.
        </p>
      </Etapa>

      <Etapa n={4} titulo="Cadastrar os dados do negócio">
        <p>
          Sem isso a IA conversa mas <strong>não consegue agendar</strong> — ela não tem o que oferecer nem quando.
        </p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <strong>Horário de funcionamento</strong> — em Configurações.
          </li>
          <li>
            <strong>Serviços</strong> — nome, duração, preço e folga antes/depois.
          </li>
          <li>
            <strong>Profissionais</strong> — só se a loja tiver equipe. Sem equipe, a agenda usa a fila de cadeira
            única.
          </li>
          <li>
            <strong>Antecedência mínima</strong> para agendamento.
          </li>
        </ul>
      </Etapa>

      <Etapa n={5} titulo="Criar o workflow no n8n">
        <p>Duplique um workflow que já funciona e troque o que é da loja.</p>
        <ol className="ml-4 list-decimal space-y-1">
          <li>Duplique o workflow-modelo no n8n e renomeie com o nome da loja.</li>
          <li>
            Troque o <strong>prompt</strong> do AI Agent pelo texto desta loja (nome, cidade, tom).
          </li>
          <li>
            Troque o <strong>ID do sub-workflow de agenda</strong> para o da loja nova.
          </li>
          <li>Troque os IDs dos documentos de preços/políticas, se usar.</li>
          <li>Ative o workflow e copie a URL do webhook.</li>
          <li>
            Cole a URL nos <strong>Links</strong> da loja, no Super Admin.
          </li>
        </ol>
        <Aviso>
          Não troque a chave do Redis. Ela precisa continuar sendo o <code>conversationId</code> — é o que garante que
          duas lojas com o mesmo cliente não dividam buffer e memória. Chave por telefone MISTURA as conversas.
        </Aviso>
      </Etapa>

      <Etapa n={6} titulo="Testar o isolamento antes de entregar">
        <p>Com duas ou mais lojas no ar, estes testes não são opcionais:</p>
        <ul className="ml-4 list-disc space-y-1">
          <li>Mensagem na loja nova aparece só no inbox dela.</li>
          <li>A mesma mensagem NÃO aparece em nenhuma outra loja.</li>
          <li>Agendamento pedido na loja nova cai na agenda dela.</li>
          <li>O mesmo telefone falando com duas lojas gera duas conversas separadas.</li>
        </ul>
        <p className="text-xs text-[var(--color-muted)]">
          Depois de conferir, marque as etapas manuais no card da loja para não perder o controle de quem está pronta.
        </p>
      </Etapa>

      {criada && (
        <Link href="/super-admin" className={`${BOTAO} inline-block text-center`}>
          Ir para a loja no Super Admin
        </Link>
      )}
    </div>
  );
}

function Etapa({
  n,
  titulo,
  children,
  feita = false,
  destaque = false,
}: {
  n: number;
  titulo: string;
  children: React.ReactNode;
  feita?: boolean;
  destaque?: boolean;
}) {
  return (
    <section
      className={`rounded-2xl border bg-white p-4 shadow-sm sm:p-5 ${
        destaque ? "border-[var(--color-primary)]" : "border-black/5"
      }`}
    >
      <h2 className="flex items-center gap-2 font-bold">
        <span
          className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-extrabold ${
            feita ? "bg-emerald-100 text-emerald-700" : "bg-[var(--color-surface)] text-[var(--color-muted)]"
          }`}
        >
          {feita ? <Check className="size-3.5" /> : n}
        </span>
        {titulo}
      </h2>
      <div className="mt-2 space-y-2 text-sm text-[var(--color-ink)]">{children}</div>
    </section>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function Campo({ rotulo, dica, children }: { rotulo: string; dica: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold uppercase text-[var(--color-muted)]">{rotulo}</span>
      <span className="mb-1 block text-xs text-[var(--color-muted)]">{dica}</span>
      {children}
    </label>
  );
}

const INPUT =
  "w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const BOTAO = "rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50";
