// PM2: pm2 start ecosystem.config.cjs && pm2 save && pm2 startup
//
// WORKER_NODE_BIN: caminho absoluto do Node, quando o `node` do PATH não serve.
// O daemon do PM2 roda com o PATH do sistema — se o Node de lá for antigo
// demais pro `--import tsx` abaixo, o worker não sobe. Na VPS de produção o
// PATH tem o v20 e o worker precisa do v24, então lá essa variável aponta pro
// binário do nvm. Em máquina onde o `node` do PATH já serve, não precisa.
module.exports = {
  apps: [
    {
      name: "diny-worker",
      cwd: __dirname,
      script: "src/index.ts",
      interpreter: process.env.WORKER_NODE_BIN || "node",
      interpreter_args: "--env-file=.env --import tsx",
      autorestart: true,
      max_memory_restart: "300M",
      env: { NODE_ENV: "production" },
    },
  ],
};
