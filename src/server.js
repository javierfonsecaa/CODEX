import { createServer as http } from 'node:http';
import { createServer as https } from 'node:https';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { matchesPassword, passwordRecord, profiles } from './accounts.js';
import { categories, channels, createTicket, importCustomers, Problem, text, transitions, updateTicket } from './domain.js';
import { demoAccounts, demoState, demoPassword } from './demo.js';
import { loadStore } from './store.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const sessionLifetime = 4 * 3600000;
const dummy = passwordRecord('sin cuenta');

export async function createAurora({ directory, users, demonstration = false, tls, clock = () => new Date(), sessionMs = sessionLifetime } = {}) {
  if (!Array.isArray(users) || users.length !== profiles.length || !profiles.every(profile => users.some(user =>
    user.id === profile.id && user.role === profile.role && text(user.name) && typeof user.active === 'boolean' &&
    /^[a-f\d]{32}$/.test(user.salt) && /^[a-f\d]{128}$/.test(user.hash)))) {
    throw new Error('El archivo de cuentas debe contener los cinco perfiles de Aurora.');
  }
  const agents = users.filter(user => user.role === 'agente');
  const publicUsers = users.map(({ id, name, role, active }) => ({ id, name, role, active }));
  const store = await loadStore(directory, users, demonstration ? demoState(users, clock()) : undefined, clock);
  const html = await readFile(join(root, 'index.html'));
  const sessions = new Map(), subscribers = new Set(), loginAttempts = new Map();

  function streamMessage(client, payload) {
    if (client.response.writableLength > 64000) {
      client.response.destroy();
      return;
    }
    client.response.write(payload);
  }

  function publish(revision) {
    const message = 'data: ' + JSON.stringify({ revision }) + '\n\n';
    for (const client of subscribers) {
      const session = sessions.get(client.token);
      if (!session || session.expires <= clock().getTime()) client.response.end();
      else streamMessage(client, message);
    }
  }

  const heartbeat = setInterval(() => {
    for (const client of subscribers) {
      const session = sessions.get(client.token);
      if (!session || session.expires <= clock().getTime()) client.response.end();
      else streamMessage(client, ': keep-alive\n\n');
    }
    for (const [token, session] of sessions) if (session.expires <= clock().getTime()) sessions.delete(token);
    for (const [key, item] of loginAttempts) if (item.until <= clock().getTime()) loginAttempts.delete(key);
  }, 12000);
  heartbeat.unref();

  function json(response, status, value) {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(value));
  }

  async function body(request) {
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) throw new Problem(415, 'Se requiere contenido JSON.');
    const parts = [];
    let size = 0;
    for await (const part of request.iterator({ destroyOnReturn: false })) {
      size += part.length;
      if (size > 32 * 1024 * 1024) {
        request.resume();
        throw new Problem(413, 'El archivo excede 32 MB.');
      }
      parts.push(part);
    }
    let result;
    try { result = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { throw new Problem(400, 'El JSON de la petición no es válido.'); }
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Problem(400, 'Se requiere un objeto JSON.');
    return result;
  }

  function login(request, response, input) {
    const id = text(input.id).toLowerCase();
    const password = typeof input.password === 'string' && input.password.length <= 256 ? input.password : '';
    const user = users.find(item => item.id === id && item.active);
    const ip = request.socket.remoteAddress ?? 'unknown';
    const time = clock().getTime();
    const key = ip + ':' + (user?.id ?? '?');
    const limit = loginAttempts.get(key);
    if (limit?.until > time && limit.count >= 12) throw new Problem(429, 'Hubo varios intentos fallidos. Intenta de nuevo en unos minutos.');
    if (!matchesPassword(password, user ?? dummy) || !user) {
      loginAttempts.set(key, limit?.until > time ? { ...limit, count: limit.count + 1 } : { until: time + 5 * 60000, count: 1 });
      throw new Problem(401, 'Revisa el usuario y la contraseña.');
    }
    loginAttempts.delete(key);
    const token = randomBytes(32).toString('base64url');
    sessions.set(token, { user, expires: time + sessionMs });
    json(response, 200, { token, user: publicUsers.find(item => item.id === id) });
  }

  function coordinator(user) {
    if (user.role !== 'coordinador') throw new Problem(403, 'Esta operación está reservada a coordinación.');
  }

  async function route(request, response) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    const pathname = new URL(request.url, 'http://aurora.local').pathname;
    const method = request.method;
    const origin = request.headers.origin;
    if (origin && pathname.startsWith('/api/')) {
      let sameHost = false;
      if (origin !== 'null') {
        try { sameHost = new URL(origin).host === request.headers.host; } catch {}
        if (!sameHost) throw new Problem(403, 'Origen no autorizado.');
      }
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Vary', 'Origin');
    }
    if (method === 'OPTIONS' && pathname.startsWith('/api/')) {
      response.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key',
        'Access-Control-Max-Age': '600',
      });
      return response.end();
    }
    if (method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'DENY' });
      return response.end(html);
    }
    if (method === 'GET' && pathname === '/health') return json(response, 200, { ready: true });
    if (method === 'GET' && pathname === '/api/meta') {
      return json(response, 200, { demonstration, ...(demonstration && { demoPassword }) });
    }
    if (method === 'POST' && pathname === '/api/login') return login(request, response, await body(request));

    const token = /^Bearer ([\w-]+)$/.exec(request.headers.authorization ?? '')?.[1];
    const session = sessions.get(token);
    if (!session || session.expires <= clock().getTime()) throw new Problem(401, 'Inicia sesión para continuar.');
    const { user } = session;
    if (method === 'POST' && pathname === '/api/logout') {
      sessions.delete(token);
      for (const client of subscribers) if (client.token === token) client.response.end();
      return json(response, 200, { ok: true });
    }
    if (method === 'GET' && pathname === '/api/state') {
      const { revision, customers, tickets, events } = store.read();
      return json(response, 200, { revision, customers, tickets, events, users: publicUsers, channels, categories, transitions, now: clock().toISOString() });
    }
    if (method === 'GET' && pathname === '/api/events') {
      response.writeHead(200, { 'Content-Type': 'text/event-stream', 'X-Accel-Buffering': 'no', 'Cache-Control': 'no-cache, no-transform' });
      const client = { response, token };
      subscribers.add(client);
      response.on('close', () => subscribers.delete(client));
      return streamMessage(client, 'data: ' + JSON.stringify({ revision: store.read().revision }) + '\n\n');
    }
    if (method === 'GET' && pathname === '/api/backup') {
      coordinator(user);
      response.setHeader('Content-Disposition', 'attachment; filename="aurora-respaldo.json"');
      return json(response, 200, store.read());
    }
    if (method === 'POST' && pathname === '/api/tickets') {
      const data = await body(request);
      const result = await store.transact(draft => {
        const value = createTicket(draft, data, user.id, agents, clock(), request.headers['idempotency-key'] ?? '');
        return { value, unchanged: value.repeated };
      });
      if (!result.repeated) publish(store.read().revision);
      return json(response, result.repeated ? 200 : 201, result);
    }
    const match = pathname.match(/^\/api\/tickets\/(AUR-\d{6}-\d{4})$/);
    if (method === 'PATCH' && match) {
      const data = await body(request);
      const ticket = await store.transact(draft => ({ value: updateTicket(draft, match[1], data, user, agents, clock()) }));
      publish(store.read().revision);
      return json(response, 200, { ticket });
    }
    if (method === 'POST' && pathname === '/api/customers/import') {
      coordinator(user);
      const data = await body(request);
      const result = await store.transact(draft => ({ value: importCustomers(draft, data.format, data.content) }));
      publish(store.read().revision);
      return json(response, 200, result);
    }
    if (method === 'POST' && pathname === '/api/restore') {
      coordinator(user);
      const data = await body(request);
      if (data.confirmed !== true || !Number.isSafeInteger(data.revision)) throw new Problem(422, 'Confirma expresamente la restauración.');
      const result = await store.restore(data.backup, data.revision, user.id);
      publish(store.read().revision);
      return json(response, 200, result);
    }
    throw new Problem(404, 'Ruta no disponible.');
  }

  const listener = (request, response) => route(request, response).catch(error => {
    if (response.headersSent || response.destroyed) return response.end();
    if (!(error instanceof Problem)) console.error(error);
    json(response, error.status ?? 500, { error: error instanceof Problem ? error.message : 'Ocurrió un error en el servicio.', ...(error.extra ?? {}) });
  });
  const server = tls ? https(tls, listener) : http(listener);
  server.on('close', () => clearInterval(heartbeat));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const demonstration = process.argv.includes('--demo');
  const directory = resolve(process.env.AURORA_DATA_DIR ?? (demonstration ? 'data/demo' : 'data/piloto'));
  const users = demonstration ? demoAccounts() : JSON.parse(await readFile(process.env.AURORA_ACCOUNTS ?? join(directory, 'accounts.json'), 'utf8'));
  const key = process.env.AURORA_TLS_KEY;
  const cert = process.env.AURORA_TLS_CERT;
  if (Boolean(key) !== Boolean(cert)) throw new Error('Configura ambos archivos TLS.');
  const tls = key && cert ? { key: await readFile(key), cert: await readFile(cert) } : undefined;
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '127.0.0.1';
  const server = await createAurora({ directory, users, demonstration, tls });
  server.listen(port, host, () => console.log('Aurora disponible en ' + (tls ? 'https://' : 'http://') + host + ':' + server.address().port));
}
