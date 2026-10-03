const fs = require('fs');
const path = require('path');

function loadEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

// secrets.env não vai pro git — criar uma vez na VPS, ao lado deste arquivo
// (modelo em deploy/secrets.env.example).
const secrets = loadEnvFile(path.join(__dirname, 'secrets.env'));

module.exports = {
  apps: [
    {
      name: 'excellence-api-staging',
      script: 'dist/main.js',
      // O projeto exige Node >= 22.12; o Node do sistema (/usr/bin/node) é o 20 usado pelo
      // cartao-colaborativa e pelo arsenal-cac. Binário oficial isolado, fora do PATH.
      interpreter: '/opt/node22/bin/node',
      cwd: '/var/www/projetos/repo/excellence/staging/current/api',
      instances: 1,
      exec_mode: 'fork',
      env: {
        LOG_LEVEL: 'debug',
        OPENAPI_ENABLED: 'true',
        ...secrets,
        // Fixos por ambiente: não sobrescrever pelo secrets.env.
        NODE_ENV: 'production',
        API_PORT: 3201,
        // Atrás do nginx do host (1 salto): IP real do cliente no bloqueio de login e na auditoria.
        TRUST_PROXY: '1',
        // Acesso por http://IP:porta enquanto não há domínio/HTTPS: cookie "Secure" seria
        // descartado pelo navegador. Voltar pra 'true' junto com o certbot.
        AUTH_COOKIE_SECURE: 'false',
      },
      max_memory_restart: '500M',
      listen_timeout: 10000,
      kill_timeout: 5000,
      time: true,
    },
  ],
};
