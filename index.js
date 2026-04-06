const fs = require('node:fs');
const path = require('node:path');

function loadDotEnv() {
  const envPath = path.join(process.cwd(), '.env');

  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, 'utf8');

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();

const token = process.env.DISCORD_BOT_TOKEN;

if (!token) {
  console.error('Missing DISCORD_BOT_TOKEN. Add it to environment or a local .env file.');
  process.exit(1);
}

const API_BASE = 'https://discord.com/api/v10';
const GATEWAY_QUERY = '?v=10&encoding=json';

let heartbeatTimer;
let sequence = null;

async function getGatewayUrl() {
  const response = await fetch(`${API_BASE}/gateway/bot`, {
    headers: {
      Authorization: `Bot ${token}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gateway discovery failed (${response.status}): ${body}`);
  }

  const payload = await response.json();
  return `${payload.url}${GATEWAY_QUERY}`;
}

function startHeartbeat(ws, intervalMs) {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }

  heartbeatTimer = setInterval(() => {
    ws.send(
      JSON.stringify({
        op: 1,
        d: sequence,
      }),
    );
  }, intervalMs);
}

function identify(ws) {
  ws.send(
    JSON.stringify({
      op: 2,
      d: {
        token,
        intents: 1,
        properties: {
          os: process.platform,
          browser: 'discord-ai-bot',
          device: 'discord-ai-bot',
        },
      },
    }),
  );
}

async function activateBot() {
  const gatewayUrl = await getGatewayUrl();
  const ws = new WebSocket(gatewayUrl);

  ws.addEventListener('open', () => {
    console.log('Gateway connection opened.');
  });

  ws.addEventListener('message', (event) => {
    const packet = JSON.parse(event.data);

    if (typeof packet.s === 'number') {
      sequence = packet.s;
    }

    if (packet.op === 10) {
      startHeartbeat(ws, packet.d.heartbeat_interval);
      identify(ws);
      return;
    }

    if (packet.op === 11) {
      return;
    }

    if (packet.t === 'READY') {
      const user = packet.d.user;
      console.log(`Bot activated as ${user.username}#${user.discriminator} (${user.id})`);
    }
  });

  ws.addEventListener('close', (event) => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
    }
    console.error(`Gateway closed: code=${event.code} reason=${event.reason || 'n/a'}`);
    process.exit(1);
  });

  ws.addEventListener('error', (error) => {
    console.error('Gateway error:', error.message || error);
  });
}

activateBot().catch((error) => {
  console.error('Failed to activate bot:', error.message);
  process.exit(1);
});
