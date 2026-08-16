# Hermes — serviço próprio, isolado da aplicação e do n8n.
#
# Imagem mínima e sem estado: o Hermes não guarda dado nenhum entre requisições.
# O volume declarado no compose existe só para log e futuro cache — nunca para
# dado de negócio, que continua vivendo no Postgres, atrás das ferramentas.
FROM node:24-alpine

# Roda como usuário sem privilégio. Um processo que executa texto vindo de um
# modelo não tem razão nenhuma para ser root.
RUN addgroup -S hermes && adduser -S hermes -G hermes

WORKDIR /app

# `tsx` é a única dependência: o serviço usa só a biblioteca padrão do Node.
COPY package.json ./
RUN npm install --omit=dev --no-package-lock && npm cache clean --force

COPY tsconfig.json ./
COPY src ./src

RUN chown -R hermes:hermes /app
USER hermes

EXPOSE 8787

# Sem shell no comando: sinal do Docker chega direto no processo.
CMD ["npx", "tsx", "src/index.ts"]
