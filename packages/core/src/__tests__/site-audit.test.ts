import { describe, expect, it } from "vitest";

import { analisarLeitura, ehRedeSocial, type LeituraSite } from "../site-audit";

/**
 * O que estes testes protegem é uma promessa comercial, não um detalhe técnico:
 * a auditoria pode dizer "não sei", mas NUNCA pode afirmar que um site está
 * quebrado quando ele só recusou o robô. É com essa frase que se liga para o
 * dono do site.
 */

const base = (html: string, extra: Partial<LeituraSite> = {}): LeituraSite => ({
  url: "https://barbeariaexemplo.com.br",
  status: 200,
  ms: 800,
  html,
  ...extra,
});

/** Página que passa em tudo — serve de contraste para os casos ruins. */
const COMPLETA = `
  <html><head>
    <title>Barbearia Exemplo — cortes em Ribeirão Preto</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="Barbearia no centro">
  </head><body>
    <h1>Barbearia Exemplo</h1>
    <a href="https://wa.me/5516999999999">WhatsApp</a>
    <a href="/agendar">Agendar horário</a>
    <script src="app.js"></script>
  </body></html>`;

describe("analisarLeitura", () => {
  it("não acusa nada quando o site está completo", () => {
    const a = analisarLeitura(base(COMPLETA));
    expect(a.indeterminado).toBe(false);
    expect(a.problemas).toEqual([]);
    expect(a.oportunidade).toBe(0);
    expect(a.bons).toContain("se adapta ao celular");
    expect(a.bons).toContain("tem WhatsApp clicável");
  });

  it("aponta o celular como o problema mais pesado", () => {
    const semViewport = COMPLETA.replace(/<meta name="viewport"[^>]*>/, "");
    const a = analisarLeitura(base(semViewport));
    // Ordenado por peso: o argumento mais forte tem que ser o primeiro que você lê.
    expect(a.problemas[0]).toMatch(/celular/);
    expect(a.oportunidade).toBeGreaterThan(0);
  });

  it("reconhece a falta de agendamento, que é o que vendemos", () => {
    // Tira o link inteiro, não só o texto: o `href="/agendar"` sozinho já conta
    // como sinal de agendamento — e conta certo, é assim que a maioria marca.
    const a = analisarLeitura(base(COMPLETA.replace('<a href="/agendar">Agendar horário</a>', "")));
    expect(a.problemas.join(" ")).toMatch(/agendamento online/);
  });

  it("aceita o link como sinal de agendamento, mesmo sem a palavra no texto", () => {
    const a = analisarLeitura(base(COMPLETA.replace("Agendar horário", "Marque aqui")));
    expect(a.problemas.join(" ")).not.toMatch(/agendamento online/);
  });

  it("não julga página de desafio do Cloudflare", () => {
    const a = analisarLeitura(base("<html><body>Just a moment...</body></html>"));
    expect(a.indeterminado).toBe(true);
    // O ponto do teste: sem nota. Zero aqui viraria "site perfeito" na tela.
    expect(a.oportunidade).toBeNull();
  });

  it("não julga 403 — pode ser bloqueio ao robô, não site quebrado", () => {
    const a = analisarLeitura(base("", { status: 403 }));
    expect(a.indeterminado).toBe(true);
    expect(a.oportunidade).toBeNull();
  });

  it("julga 500, que é erro de verdade", () => {
    const a = analisarLeitura(base("", { status: 500 }));
    expect(a.indeterminado).toBe(false);
    expect(a.oportunidade).toBe(90);
  });

  it("mede a demora que o cliente sente", () => {
    const a = analisarLeitura(base(COMPLETA, { ms: 7_200 }));
    expect(a.problemas.join(" ")).toMatch(/7,2 s/);
  });

  it("vê rodapé abandonado", () => {
    const antigo = COMPLETA.replace("</body>", "<footer>© 2015 Barbearia</footer></body>");
    expect(analisarLeitura(base(antigo)).problemas.join(" ")).toMatch(/2015/);
  });

  it("não confunde aplicação moderna com página vazia", () => {
    // Curta, mas com script: é uma SPA, não um "em construção".
    const spa = `<html><head><meta name="viewport" content="width=device-width">
      <title>Barbearia Exemplo</title><meta name="description" content="x"></head>
      <body><h1>x</h1><div id="root"></div><script src="a.js"></script>
      <a href="https://wa.me/551699">z</a><a href="/agendar">agendar</a></body></html>`;
    expect(analisarLeitura(base(spa)).problemas.join(" ")).not.toMatch(/em construção/);
  });

  it("avisa quando falta cadeado", () => {
    const a = analisarLeitura(base(COMPLETA, { url: "http://barbeariaexemplo.com.br" }));
    expect(a.problemas.join(" ")).toMatch(/cadeado/);
  });
});

describe("ehRedeSocial", () => {
  it("reconhece perfil e agregador", () => {
    expect(ehRedeSocial("https://instagram.com/barbearia")).toBe(true);
    expect(ehRedeSocial("https://linktr.ee/barbearia")).toBe(true);
    expect(ehRedeSocial("https://wa.me/5516999999999")).toBe(true);
  });

  it("não confunde site próprio com rede social", () => {
    expect(ehRedeSocial("https://barbeariaexemplo.com.br")).toBe(false);
    // O nome contém "bio", mas o domínio é próprio.
    expect(ehRedeSocial("https://biobarbearia.com.br")).toBe(false);
  });
});
