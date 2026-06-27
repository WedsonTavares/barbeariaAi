// PM2: pm2 start ecosystem.config.cjs && pm2 save && pm2 startup
module.exports = {
  apps: [
    {
      name: "diny-worker",
      cwd: __dirname,
      script: "src/index.ts",
      interpreter: "node",
      interpreter_args: "--env-file=.env --import tsx",
      autorestart: true,
      max_memory_restart: "300M",
      env: { NODE_ENV: "production" },
    },
  ],
};
