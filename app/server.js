// PeekMe: site + emissor de tokens do LiveKit.
// O vídeo não passa por aqui: vai do navegador de quem transmite para o LiveKit,
// e do LiveKit para quem assiste.
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { AccessToken, RoomServiceClient } = require('livekit-server-sdk');

const PORT = Number(process.env.PORT || 3077);
const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const HOST_PASSWORD = process.env.HOST_PASSWORD;
// Endereço interno do LiveKit (para criar/encerrar salas).
const LIVEKIT_HTTP = process.env.LIVEKIT_HTTP_URL || 'http://127.0.0.1:7880';
// Endereço que o navegador usa. Vazio = mesmo domínio do site (o Caddy encaminha /rtc).
const LIVEKIT_PUBLIC_URL = process.env.LIVEKIT_PUBLIC_URL || '';
const MAX_VIEWERS = Number(process.env.MAX_VIEWERS || 5);

for (const [name, value] of Object.entries({ LIVEKIT_API_KEY: API_KEY, LIVEKIT_API_SECRET: API_SECRET, HOST_PASSWORD })) {
  if (!value) { console.error(`Falta a variável ${name} (veja o arquivo .env)`); process.exit(1); }
}

const rooms = new RoomServiceClient(LIVEKIT_HTTP, API_KEY, API_SECRET);
const PUBLIC_DIR = path.join(__dirname, 'public');
const LK_CLIENT = require.resolve('livekit-client'); // dist/livekit-client.umd.js
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const HOST_ID = 'host';

// Só existe uma transmissão por vez.
let current = null; // { room, hostSecret }

// Limite simples de tentativas de senha por IP.
const failures = new Map(); // ip -> { count, until }
function blocked(ip) {
  const f = failures.get(ip);
  return f && f.count >= 5 && Date.now() < f.until;
}
function fail(ip) {
  const f = failures.get(ip);
  if (!f || Date.now() > f.until) failures.set(ip, { count: 1, until: Date.now() + 60_000 });
  else f.count++;
}

function checkPassword(given) {
  const a = crypto.createHash('sha256').update(String(given || '')).digest();
  const b = crypto.createHash('sha256').update(HOST_PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}

function newCode() {
  return Array.from(crypto.randomBytes(8), b => ALPHABET[b % ALPHABET.length]).join('');
}

// A transmissão atual ainda está no ar? (a sala existe e o transmissor está nela)
async function isLive(room) {
  try {
    const list = await rooms.listParticipants(room);
    return list.some(p => p.identity === HOST_ID);
  } catch {
    return false;
  }
}

// TURN do Cloudflare (opcional): necessário quando a internet da casa usa CGNAT
// no IPv4 (ex.: Starlink). Quem consegue conexão direta continua direto.
const CF_TURN_KEY_ID = process.env.CF_TURN_KEY_ID;
const CF_TURN_API_TOKEN = process.env.CF_TURN_API_TOKEN;
let turnCache = null; // { iceServers, expires }

async function iceServers() {
  if (!CF_TURN_KEY_ID || !CF_TURN_API_TOKEN) return undefined;
  if (turnCache && Date.now() < turnCache.expires) return turnCache.iceServers;
  try {
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${CF_TURN_KEY_ID}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${CF_TURN_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: 86400 }),
    });
    if (!res.ok) throw new Error(`Cloudflare respondeu ${res.status}`);
    const data = await res.json();
    // O Cloudflare recomenda tirar a porta 53 nos navegadores (costuma ser bloqueada).
    const servers = [].concat(data.iceServers || []).map(srv => ({
      ...srv,
      urls: [].concat(srv.urls).filter(u => !/:53(\?|$)/.test(u)),
    })).filter(srv => srv.urls.length);
    // As credenciais valem 24 h; renova a cada 12 h.
    turnCache = { iceServers: servers, expires: Date.now() + 12 * 3600_000 };
    return servers;
  } catch (err) {
    console.error('Não foi possível obter o TURN do Cloudflare:', err.message);
    return undefined;
  }
}

async function token(room, identity, name, grant) {
  const at = new AccessToken(API_KEY, API_SECRET, { identity, name, ttl: '12h' });
  at.addGrant({ room, roomJoin: true, ...grant });
  return at.toJwt();
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 10_000) { reject(new Error('corpo grande demais')); req.destroy(); }
    });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
}

// POST /api/start { password, force } -> { room, token, url }
async function start(req, res) {
  const ip = clientIp(req);
  if (blocked(ip)) return json(res, 429, { error: 'Muitas tentativas. Espere um minuto.' });
  const body = await readBody(req);
  if (!checkPassword(body.password)) { fail(ip); return json(res, 401, { error: 'Senha incorreta.' }); }
  failures.delete(ip);

  if (current && await isLive(current.room)) {
    if (!body.force) return json(res, 409, { error: 'Já existe uma transmissão no ar.' });
    await rooms.deleteRoom(current.room).catch(() => {});
  }

  const room = newCode();
  await rooms.createRoom({ name: room, maxParticipants: MAX_VIEWERS + 1, emptyTimeout: 60, departureTimeout: 20 });
  current = { room, hostSecret: crypto.randomBytes(16).toString('hex') };
  const jwt = await token(room, HOST_ID, 'Transmissor', { canPublish: true, canSubscribe: false, canPublishData: false });
  json(res, 200, { room, token: jwt, url: LIVEKIT_PUBLIC_URL, iceServers: await iceServers(), hostSecret: current.hostSecret, maxViewers: MAX_VIEWERS });
}

// POST /api/stop { room, hostSecret }
async function stop(req, res) {
  const body = await readBody(req);
  if (!current || body.room !== current.room || body.hostSecret !== current.hostSecret) return json(res, 403, { error: 'Não autorizado.' });
  await rooms.deleteRoom(current.room).catch(() => {});
  current = null;
  json(res, 200, { ok: true });
}

// POST /api/watch { room, name } -> { token, url }
async function watch(req, res) {
  const body = await readBody(req);
  const room = String(body.room || '').toLowerCase();
  if (!current || room !== current.room || !await isLive(room)) {
    return json(res, 404, { error: 'Essa transmissão não está no ar.' });
  }
  const list = await rooms.listParticipants(room);
  if (list.filter(p => p.identity !== HOST_ID).length >= MAX_VIEWERS) {
    return json(res, 403, { error: `A sala está cheia (máximo de ${MAX_VIEWERS} pessoas assistindo).` });
  }
  const name = String(body.name || '').trim().slice(0, 24) || 'Alguém';
  const jwt = await token(room, `v-${crypto.randomBytes(6).toString('hex')}`, name, { canPublish: false, canSubscribe: true, canPublishData: false });
  json(res, 200, { token: jwt, url: LIVEKIT_PUBLIC_URL, iceServers: await iceServers() });
}

function serveFile(res, file) {
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('Não encontrado'); return; }
    // no-cache: o navegador (e o Cloudflare) sempre confere se há versão nova.
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

const routes = { '/api/start': start, '/api/stop': stop, '/api/watch': watch };

// /rtc é a sinalização do LiveKit. O site repassa essas conexões para ele, assim
// tudo funciona por uma porta só (útil atrás de Cloudflare Tunnel ou outro proxy).
const LK = new URL(LIVEKIT_HTTP);
const isRtc = pathname => pathname === '/rtc' || pathname.startsWith('/rtc/');

function proxyRtc(req, res) {
  const upstream = http.request({ host: LK.hostname, port: LK.port, method: req.method, path: req.url, headers: req.headers }, up => {
    res.writeHead(up.statusCode, up.headers);
    up.pipe(res);
  });
  upstream.on('error', () => json(res, 502, { error: 'Servidor de vídeo indisponível.' }));
  req.pipe(upstream);
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  if (isRtc(pathname)) return proxyRtc(req, res);
  try {
    if (routes[pathname]) {
      if (req.method !== 'POST') return json(res, 405, { error: 'Use POST.' });
      return await routes[pathname](req, res);
    }
    if (pathname === '/healthz') return json(res, 200, { ok: true });
    if (pathname === '/vendor/livekit-client.js') return serveFile(res, LK_CLIENT);
    // /assistir/<codigo> e qualquer outra rota abrem o app
    const file = path.normalize(path.join(PUBLIC_DIR, pathname));
    if (file.startsWith(PUBLIC_DIR + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) return serveFile(res, file);
    serveFile(res, path.join(PUBLIC_DIR, 'index.html'));
  } catch (err) {
    console.error(err);
    json(res, 500, { error: 'Erro no servidor. Tente de novo.' });
  }
});

server.on('upgrade', (req, socket, head) => {
  if (!isRtc(new URL(req.url, 'http://x').pathname)) { socket.destroy(); return; }
  const upstream = net.connect(Number(LK.port), LK.hostname, () => {
    const headers = Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n');
    upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${headers}\r\n\r\n`);
    if (head.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
});

server.listen(PORT, () => console.log(`PeekMe rodando na porta ${PORT}`));
