/**
 * Chaves de funcionalidade das extensões novas.
 *
 * O projeto não tem biblioteca de feature flag — lê `process.env` direto, como
 * em `N8N_AGENT_WEBHOOK_URL` e `AI_ALLOWLIST`. Este módulo segue a mesma
 * convenção e só centraliza a leitura, para não espalhar `=== "true"` pelas
 * telas.
 *
 * Regra: com TODAS desligadas — que é o padrão — o sistema se comporta
 * exatamente como antes destas extensões existirem. Nenhuma rota nova aparece
 * no menu e nenhuma chamada externa acontece.
 *
 * Server-side apenas. Nenhuma destas variáveis é `NEXT_PUBLIC_`, de propósito:
 * se uma flag fosse para o browser, o segredo que ela guarda iria junto.
 */
const ligada = (v: string | undefined) => v?.trim().toLowerCase() === "true";

export const flags = {
  /** Prospecção pela Apify (Google Maps). Exige `APIFY_TOKEN`. */
  get apify() {
    return ligada(process.env.FEATURE_APIFY);
  },
  /** Camada de inteligência no Super Admin. Exige o serviço Hermes no ar. */
  get hermes() {
    return ligada(process.env.FEATURE_HERMES);
  },
  /**
   * Inteligência dentro do painel de UMA loja. Continua desligada até o
   * escopo por tenant estar exercitado — quando ligar, o Hermes só pode
   * enxergar os dados da loja resolvida no servidor, nunca de payload.
   */
  get storeIntelligence() {
    return ligada(process.env.FEATURE_STORE_INTELLIGENCE);
  },
};
