"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Swagger UI carregado por CDN em vez de dependência do projeto: a biblioteca
 * pesa mais de 1 MB e só é usada nesta tela — trazê-la para o bundle penalizaria
 * o painel inteiro. Versão fixada para a tela não quebrar sozinha num release
 * novo do Swagger; atualizar é trocar a linha abaixo.
 */
const SWAGGER_VERSION = "5.32.11";
const CDN = `https://unpkg.com/swagger-ui-dist@${SWAGGER_VERSION}`;

declare global {
  interface Window {
    SwaggerUIBundle?: (config: Record<string, unknown>) => unknown;
  }
}

function carregarCss(href: string) {
  if (document.querySelector(`link[data-swagger="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.swagger = href;
  document.head.appendChild(link);
}

function carregarScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existente = document.querySelector<HTMLScriptElement>(`script[data-swagger="${src}"]`);
    if (existente) {
      if (existente.dataset.pronto === "1") resolve();
      else {
        existente.addEventListener("load", () => resolve());
        existente.addEventListener("error", () => reject(new Error(src)));
      }
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.swagger = src;
    script.addEventListener("load", () => {
      script.dataset.pronto = "1";
      resolve();
    });
    script.addEventListener("error", () => reject(new Error(src)));
    document.head.appendChild(script);
  });
}

export function SwaggerUI() {
  const container = useRef<HTMLDivElement>(null);
  const [erro, setErro] = useState(false);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      try {
        carregarCss(`${CDN}/swagger-ui.css`);
        await carregarScript(`${CDN}/swagger-ui-bundle.js`);
        if (cancelado || !container.current || !window.SwaggerUIBundle) return;

        window.SwaggerUIBundle({
          url: "/openapi.yaml",
          domNode: container.current,
          docExpansion: "list",
          // Mantém o x-diny-secret enquanto a aba estiver aberta, em vez de
          // pedir a cada requisição.
          persistAuthorization: true,
          tryItOutEnabled: true,
        });
        setCarregando(false);
      } catch {
        if (!cancelado) {
          setErro(true);
          setCarregando(false);
        }
      }
    })();

    return () => {
      cancelado = true;
    };
  }, []);

  if (erro) {
    return (
      <div className="rounded-xl border border-black/5 bg-white p-4 text-sm">
        <p className="font-semibold">Não consegui carregar o Swagger UI.</p>
        <p className="mt-1 text-[var(--color-muted)]">
          Ele vem de unpkg.com — verifique a conexão. A especificação continua
          disponível em{" "}
          <a className="underline" href="/openapi.yaml">
            /openapi.yaml
          </a>
          , e você pode abri-la em editor.swagger.io ou no Insomnia.
        </p>
      </div>
    );
  }

  return (
    <>
      {carregando && (
        <p className="text-sm text-[var(--color-muted)]">Carregando a documentação…</p>
      )}
      <div ref={container} />
    </>
  );
}
