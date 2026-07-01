const path = require("path");

const serverRoot = __dirname;
const cfConfig = path.join(serverRoot, "cloudflare", "config.yml");
const logsDir = path.join(serverRoot, "cloudflare", "logs");
const tunnelMode = String(process.env.TUNNEL_MODE || "quick").toLowerCase();

const tunnelApp =
  tunnelMode === "named"
    ? {
        name: "cloudflare-tunnel",
        script: "cloudflared",
        args: ["tunnel", "--config", cfConfig, "run", "--loglevel", "info"],
      }
    : {
        name: "cloudflare-tunnel",
        script: "cloudflared",
        args: ["tunnel", "--url", "http://127.0.0.1:5000", "--loglevel", "info"],
      };

module.exports = {
  apps: [
    {
      name: "cds-api",
      script: "src/server.js",
      cwd: serverRoot,
      instances: 1,
      autorestart: true,
      max_memory_restart: "1G",
      env: { NODE_ENV: "production" },
      error_file: path.join(logsDir, "pm2-api-error.log"),
      out_file: path.join(logsDir, "pm2-api-out.log"),
      merge_logs: true,
      time: true,
    },
    {
      ...tunnelApp,
      autorestart: true,
      max_restarts: 20,
      restart_delay: 5000,
      error_file: path.join(logsDir, "pm2-tunnel-error.log"),
      out_file: path.join(logsDir, "pm2-tunnel-out.log"),
      merge_logs: true,
      time: true,
    },
  ],
};
