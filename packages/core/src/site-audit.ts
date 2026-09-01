/**
 * Auditoria do site de um lead — responde "esse site precisa de melhoria?".
 *
 * POR QUE ISTO EXISTE
 *   `pontuar()` na prospecção já sabe dizer quem NÃO tem site. Quem TEM some do
 *   radar, e não deveria: um site que não abre no celular, que demora 8 s ou que
 *   não tem onde marcar horário é uma venda tão boa quanto a ausência de site —
 *   só exige um argumento diferente. Este módulo produz esse argumento.
 *
 * O QUE ELE NÃO É
 *   Não é auditoria de performance. Não roda Lighthouse, não mede Core Web
 *   Vitals, não pontua SEO. Mede o que dá para ler numa requisição e que o dono
 *   da barbearia reconhece quando você fala: "abre torto no celular", "demorou
 *   seis segundos", "não tem onde marcar horário". Esses são os fatos que
 *   viram conversa; o resto vira relatório que ninguém lê.
 *
 * A REGRA MAIS IMPORTANTE AQUI É NÃO MENTIR
 *   Site atrás de Cloudflare devolve 403 para robô e 200 para gente. Chamar isso
 *   de "site quebrado" faria você ligar afirmando uma coisa falsa — o pior erro
 *   possível numa abordagem comercial. Por isso existe `indeterminado`: quando
 *   não dá para julgar, a auditoria diz que não sabe, em vez de chutar.
 */

/** Uma leitura já feita do site. Separada do `fetch` para poder ser testada. */
export type LeituraSite = {
  /** URL final, depois de redirecionamentos. */
  url: string;
  status: number;
  /** Milissegundos até o HTML chegar. É a demora que o cliente sente. */
  ms: number;
  html: string;
};

export type AuditoriaSite = {
  /** Status HTTP. `null` quando nem chegou a pedir (link de rede social). */
  status: number | null;
  ms: number;
  /**
   * 0–100. QUANTO MAIOR, MAIS O SITE PRECISA DE AJUDA.
   *
   * `null` quando não deu para julgar. Zero ali diria "site perfeito", que é
   * exatamente a leitura errada de um site que só bloqueou o robô.
   */
  oportunidade: number | null;
  /** O que está ruim, em português, pronto para virar argumento. */
  problemas: string[];
  /** O que está bom. Evita você prometer o que a pessoa já tem. */
  bons: string[];
  indeterminado: boolean;
};

/**
 * "Site" que na verdade é perfil de rede social ou agregador de links.
 *
 * Mesma lista que a Carteira usa em `presencaDe`, mais os agregadores. Não vale
 * a pena pedir o HTML desses: o Instagram devolve uma casca vazia para robô, e o
 * diagnóstico já está decidido pela URL — a pessoa não tem site.
 */
const REDES =
  /(^|\.)(instagram|facebook|linktr|linktree|beacons|taplink|bio|linkbio)\.|(^|\.)wa\.me|api\.whatsapp|l\.instagram|m\.facebook/i;

/** Plataformas de agendamento de terceiros usadas como "site". */
const AGENDADORES = /(booksy|trinks|inbarberapp|appbarber|barberapp|salonsoft|agendei|belasy)\./i;

export function ehRedeSocial(site: string): boolean {
  const h = hostDe(site);
  return h !== null && REDES.test(h);
}

function hostDe(site: string): string | null {
  try {
    return new URL(site.startsWith("http") ? site : `https://${site}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Página de desafio (Cloudflare, captcha, "verificando seu navegador").
 *
 * Vem com status 200 e HTML — passaria por site de verdade e seria reprovada em
 * todos os itens, porque nenhum deles está lá. É o falso positivo mais comum.
 */
function ehDesafio(html: string): boolean {
  return /just a moment|checking your browser|cf-browser-verification|attention required|enable javascript and cookies|captcha/i.test(
    html.slice(0, 4_000)
  );
}

/** Cada achado pesa o quanto ele vale numa conversa de venda. */
type Achado = { peso: number; texto: string };

/**
 * O julgamento em si — puro, para poder ser testado sem rede.
 *
 * Os pesos não são arbitrários: refletem o que faz o dono parar e ouvir. "Não
 * funciona no celular" é o mais forte porque a clientela dele chega pelo
 * celular; "sem título no Google" é o mais fraco porque ele não sente esse.
 */
export function analisarLeitura(l: LeituraSite): AuditoriaSite {
  const ms = Math.max(0, Math.round(l.ms));

  if (ehDesafio(l.html)) {
    return {
      status: l.status,
      ms,
      oportunidade: null,
      problemas: ["o site bloqueou a leitura automática — abra o link e confira à mão"],
      bons: [],
      indeterminado: true,
    };
  }

  if (l.status === 403 || l.status === 429) {
    return {
      status: l.status,
      ms,
      oportunidade: null,
      problemas: [`o site recusou o acesso automático (${l.status}) — abra o link e confira à mão`],
      bons: [],
      indeterminado: true,
    };
  }

  if (l.status >= 400) {
    return {
      status: l.status,
      ms,
      oportunidade: 90,
      problemas: [`o site responde com erro ${l.status} — está no ar mas não abre`],
      bons: [],
      indeterminado: false,
    };
  }

  const html = l.html;
  const cabeca = html.slice(0, 200_000);
  const problemas: Achado[] = [];
  const bons: string[] = [];

  // ── Cadeado ──────────────────────────────────────────────────────────────
  if (l.url.startsWith("http://")) {
    problemas.push({ peso: 14, texto: "sem cadeado (HTTP) — o navegador avisa 'site não seguro'" });
  } else {
    bons.push("tem cadeado (HTTPS)");
  }

  // ── Celular ──────────────────────────────────────────────────────────────
  // O argumento mais forte que existe: sem viewport a página abre reduzida no
  // telefone, e é do telefone que vem a clientela de barbearia.
  if (/<meta[^>]+name=["']?viewport/i.test(cabeca)) {
    bons.push("se adapta ao celular");
  } else {
    problemas.push({ peso: 26, texto: "não se adapta ao celular — abre miniaturizado no telefone" });
  }

  // ── Agendamento ──────────────────────────────────────────────────────────
  // É o que nós vendemos. Se já tem, a oferta muda; se não tem, é o gancho.
  if (/agendar|agendamento|marcar\s+hor|reservar|book\s*now|booking|schedule/i.test(html)) {
    bons.push("já fala em agendamento");
  } else {
    problemas.push({ peso: 20, texto: "sem agendamento online — só telefone" });
  }

  // ── WhatsApp ─────────────────────────────────────────────────────────────
  if (/wa\.me|api\.whatsapp|whatsapp:\/\/|web\.whatsapp/i.test(html)) {
    bons.push("tem WhatsApp clicável");
  } else {
    problemas.push({ peso: 12, texto: "sem WhatsApp clicável no site" });
  }

  // ── Demora ───────────────────────────────────────────────────────────────
  const seg = (ms / 1000).toFixed(1).replace(".", ",");
  if (ms > 6_000) problemas.push({ peso: 18, texto: `demorou ${seg} s para abrir` });
  else if (ms > 3_000) problemas.push({ peso: 10, texto: `demorou ${seg} s para abrir` });
  else bons.push(`abre em ${seg} s`);

  // ── Achado no Google ─────────────────────────────────────────────────────
  const titulo = cabeca.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i)?.[1]?.trim() ?? "";
  if (titulo.length < 5) {
    problemas.push({ peso: 8, texto: "sem título — aparece sem nome nos resultados do Google" });
  }
  if (!/<meta[^>]+name=["']?description/i.test(cabeca)) {
    problemas.push({ peso: 6, texto: "sem descrição para o Google" });
  }
  if (!/<h1[\s>]/i.test(html)) {
    problemas.push({ peso: 5, texto: "sem título principal na página (h1)" });
  }

  // ── Tecnologia parada no tempo ───────────────────────────────────────────
  if (/<frameset|<font\s|<center>|<marquee/i.test(html)) {
    problemas.push({ peso: 12, texto: "feito com tecnologia antiga (o código é dos anos 2000)" });
  }

  // O rodapé é onde o abandono aparece: ninguém atualiza o ano de um site vivo.
  const anos = [...html.matchAll(/(?:©|&copy;|copyright)[^0-9]{0,24}(20\d\d)/gi)]
    .map((m) => Number(m[1]))
    .filter((a) => a >= 2000 && a <= 2100);
  const maisRecente = anos.length ? Math.max(...anos) : null;
  const anoAtual = new Date().getFullYear();
  if (maisRecente !== null && anoAtual - maisRecente >= 3) {
    problemas.push({ peso: 8, texto: `rodapé parado em ${maisRecente} — site abandonado` });
  }

  // ── Casca vazia ──────────────────────────────────────────────────────────
  // Página curta E sem script é "em construção" ou domínio estacionado. Com
  // script pode ser aplicação que monta tudo no navegador, e aí o tamanho do
  // HTML não diz nada.
  if (html.trim().length < 1_500 && !/<script/i.test(html)) {
    problemas.push({ peso: 12, texto: "página quase vazia — parece 'em construção'" });
  }

  // ── Agendador de terceiro ────────────────────────────────────────────────
  const host = hostDe(l.url);
  if (host && AGENDADORES.test(host)) {
    problemas.push({
      peso: 15,
      texto: "não é site próprio — é uma página dentro de uma plataforma de agendamento",
    });
  }

  const soma = problemas.reduce((t, p) => t + p.peso, 0);
  return {
    status: l.status,
    ms,
    oportunidade: Math.max(0, Math.min(100, soma)),
    problemas: problemas.sort((a, b) => b.peso - a.peso).map((p) => p.texto),
    bons,
    indeterminado: false,
  };
}

/** Teto de leitura. Nenhuma checagem daqui precisa de mais do que isto, e um
 *  site que devolve 40 MB não pode segurar a auditoria dos outros. */
const MAX_HTML = 400_000;

/** Tempo que a gente espera. Acima disso o cliente já teria desistido também. */
const TIMEOUT_MS = 10_000;

/**
 * Lê o site e devolve o diagnóstico.
 *
 * Manda `User-Agent` de navegador de propósito: muita hospedagem devolve 403
 * para requisição sem agente, e isso viraria "indeterminado" em site que está
 * perfeitamente no ar — ruído em vez de informação.
 */
export async function auditarSite(site: string): Promise<AuditoriaSite> {
  const alvo = site.trim();
  if (!alvo) {
    return {
      status: null, ms: 0, oportunidade: null, indeterminado: true,
      problemas: ["sem endereço de site para conferir"], bons: [],
    };
  }

  if (ehRedeSocial(alvo)) {
    // Decidido pela URL: pedir o HTML do Instagram devolve casca vazia e o
    // diagnóstico não mudaria em nada.
    return {
      status: null, ms: 0, oportunidade: 75, indeterminado: false,
      problemas: [
        "não é site próprio — é um perfil de rede social",
        "sem agendamento online — só telefone ou direct",
      ],
      bons: [],
    };
  }

  const url = alvo.startsWith("http") ? alvo : `https://${alvo}`;
  const inicio = Date.now();

  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
        "accept-language": "pt-BR,pt;q=0.9",
      },
      cache: "no-store",
    });
  } catch (e) {
    // Timeout e falha de rede ficam INDETERMINADOS de propósito. Podem ser o
    // site morto — mas também podem ser bloqueio ao nosso IP, e afirmar "o site
    // não abre" para quem tem o site no ar destrói a conversa no primeiro
    // minuto. O texto manda conferir à mão.
    const timeout = e instanceof Error && e.name === "TimeoutError";
    return {
      status: 0,
      ms: Date.now() - inicio,
      oportunidade: null,
      indeterminado: true,
      problemas: [
        timeout
          ? `não respondeu em ${TIMEOUT_MS / 1000} s — pode estar fora do ar ou bloqueando robô; confira à mão`
          : "não foi possível abrir o endereço — confira à mão",
      ],
      bons: [],
    };
  }

  const tipo = res.headers.get("content-type") ?? "";
  // Conteúdo que não é página (PDF, imagem, download) não tem o que auditar.
  if (res.ok && tipo && !/html|xml|text\/plain/i.test(tipo)) {
    return {
      status: res.status,
      ms: Date.now() - inicio,
      oportunidade: null,
      indeterminado: true,
      problemas: [`o endereço não devolve uma página (${tipo.split(";")[0]}) — confira à mão`],
      bons: [],
    };
  }

  const html = (await res.text().catch(() => "")).slice(0, MAX_HTML);
  return analisarLeitura({ url: res.url || url, status: res.status, ms: Date.now() - inicio, html });
}
