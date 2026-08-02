// PM2: pm2 start ecosystem.config.cjs && pm2 save && pm2 startup
//
// Escolha do Node: o `--import tsx` abaixo precisa de Node >= 22, e o `node` do
// PATH nem sempre é o certo — na VPS o PATH tem o v20 do sistema e o v24 está
// no nvm. Depender de variável de ambiente não resolve: o PM2 lê este arquivo
// com o ambiente de quem chamou, e um `export` no ~/.bashrc não chega numa
// sessão SSH não-interativa (`ssh host "pm2 reload ..."`) — o worker subiria
// com o v20 e morreria. Então o arquivo procura o binário sozinho.
const fs = require("node:fs");
const path = require("node:path");

/** Maior versão >= 22 instalada no nvm, ou null. */
function nodeDoNvm() {
  const bases = [process.env.NVM_DIR, path.join(process.env.HOME || "/root", ".nvm"), "/root/.nvm"];
  for (const base of bases) {
    if (!base) continue;
    const dir = path.join(base, "versions", "node");
    let versoes;
    try {
      versoes = fs.readdirSync(dir);
    } catch {
      continue;
    }
    const candidatas = versoes
      .map((v) => ({ nome: v, major: Number.parseInt(v.replace(/^v/, ""), 10) }))
      .filter((v) => Number.isFinite(v.major) && v.major >= 22)
      .sort((a, b) => b.major - a.major);
    for (const { nome } of candidatas) {
      const bin = path.join(dir, nome, "bin", "node");
      if (fs.existsSync(bin)) return bin;
    }
  }
  return null;
}

// WORKER_NODE_BIN continua valendo como escape manual, se um dia precisar
// apontar pra um binário fora do nvm.
const interpreter = process.env.WORKER_NODE_BIN || nodeDoNvm() || "node";

module.exports = {
  apps: [
    {
      name: "diny-worker",
      cwd: __dirname,
      script: "src/index.ts",
      interpreter,
      interpreter_args: "--env-file=.env --import tsx",
      autorestart: true,
      max_memory_restart: "300M",
      env: { NODE_ENV: "production" },
    },
  ],
};
