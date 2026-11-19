import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rename, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { test } from 'node:test';
import { createAurora } from '../src/server.js';
import { profiles, passwordRecord } from '../src/accounts.js';
import { createTicket, emptyState, hours48, updateTicket } from '../src/domain.js';

const password = 'contraseña-ficticia-para-pruebas';
const users = profiles.map(profile => ({ ...profile, active: true, ...passwordRecord(password) }));
const agents = users.filter(user => user.role === 'agente');
const clients = 'nit,razon_social\n090000001,"Colegio, Norte"\n900000002,Fundación Central';
const input = { nit: '090000001', channel: 'Llamada telefónica', category: 'Inconformidad de envío', description: 'El pedido llegó incompleto.' };

async function listen(directory, clock, sessionMs) {
  const server = await createAurora({ directory, users, clock, sessionMs });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server;
}

function stop(server) {
  const close = once(server, 'close');
  server.close();
  server.closeAllConnections();
  return close;
}

function request(server, route, { method = 'GET', data, token, key, signal } = {}) {
  const headers = {};
  if (data) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  if (key) headers['Idempotency-Key'] = key;
  return fetch('http://127.0.0.1:' + server.address().port + '/api/' + route, { method, headers, body: data && JSON.stringify(data), signal });
}

async function login(server, id) {
  const result = await request(server, 'login', { method: 'POST', data: { id, password } });
  assert.equal(result.status, 200);
  return (await result.json()).token;
}

async function json(server, route, options, expected = 200) {
  const response = await request(server, route, options);
  const data = await response.json();
  assert.equal(response.status, expected, JSON.stringify(data));
  return data;
}

test('límite de 48 horas, cierre, rotación, cambio de mes y agotamiento', () => {
  const state = emptyState();
  state.customers = [{ nit: input.nit, name: 'Colegio' }];
  const date = new Date('2026-12-01T04:59:59.000Z');
  const first = createTicket(state, input, agents[0].id, agents, date, 'unit-created-1').ticket;
  const second = createTicket(state, input, agents[0].id, agents, new Date(+date + 1000), 'unit-created-2').ticket;
  assert.equal(first.id, 'AUR-202611-0001');
  assert.equal(second.id, 'AUR-202612-0001');
  assert.equal(second.assignee, agents[1].id);
  updateTicket(state, first.id, { action: 'status', status: 'Pendiente logística', version: first.version }, agents[0], agents, date);
  assert.throws(() => updateTicket(state, first.id, { action: 'status', status: 'Resuelto', version: first.version }, agents[0], agents, date), /respuesta/);
  assert.throws(() => updateTicket(state, first.id, { action: 'status', status: 'Cerrado', version: first.version }, agents[0], agents, date), /transición/);
  assert.equal(first.withinSla, null);
  for (const [ticket, delta] of [[first, 0], [second, 1000]]) {
    const resolvedAt = new Date(Date.parse(ticket.dueAt) + delta);
    const actor = agents.find(agent => agent.id === ticket.assignee);
    updateTicket(state, ticket.id, { action: 'status', status: 'Resuelto', version: ticket.version, comment: 'Se completó la entrega.' }, actor, agents, resolvedAt);
    updateTicket(state, ticket.id, { action: 'status', status: 'Cerrado', version: ticket.version }, actor, agents, new Date(+resolvedAt + 3000));
    assert.equal(ticket.resolvedAt, resolvedAt.toISOString());
    assert.equal(ticket.withinSla, delta === 0);
    assert.equal(ticket.elapsedHours, (hours48 + delta) / 3600000);
  }
  const last = state.lastAgent;
  assert.throws(() => createTicket(state, input, agents[0].id, [], date, 'unit-created-3'), /agentes/);
  state.counters['202612'] = 9999;
  assert.throws(() => createTicket(state, input, agents[0].id, agents, new Date(+date + 1000), 'unit-created-4'), /consecutivos/);
  assert.equal(state.lastAgent, last);
});

test('cinco sesiones, permisos, conflictos, respaldo, reinicio y fallo de guardado', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'aurora-test-'));
  const clock = () => new Date('2026-11-19T21:00:00.000Z');
  let server = await listen(directory, clock);
  const held = [];
  try {
    const tokens = await Promise.all(users.map(user => login(server, user.id)));
    const [agent1, agent2, , , coord] = tokens;
    await json(server, 'state', {}, 401);
    await json(server, 'customers/import', { method: 'POST', token: agent1, data: { format: 'csv', content: clients } }, 403);
    await json(server, 'customers/import', { method: 'POST', token: coord, data: { format: 'csv', content: clients } });
    await json(server, 'customers/import', { method: 'POST', token: coord, data: { format: 'csv', content: clients + '\n090000001,Duplicado' } }, 422);
    assert.equal((await json(server, 'state', { token: coord })).customers.length, 2);

    for (const token of tokens) {
      const controller = new AbortController();
      const stream = await request(server, 'events', { token, signal: controller.signal });
      assert.equal(stream.status, 200);
      const reader = stream.body.pipeThrough(new TextDecoderStream()).getReader();
      assert.match((await reader.read()).value, /"revision":1/);
      held.push({ controller, reader });
    }

    const create = (token, key, data = input, status = 201) => json(server, 'tickets', { token, key, method: 'POST', data }, status);
    const invalid = await create(agent1, 'invalid-key-0001', { nit: '' }, 422);
    assert.ok(invalid.fields.nit && invalid.fields.channel);
    const creations = await Promise.all([create(agent1, 'parallel-key-01'), create(agent2, 'parallel-key-02')]);
    const tickets = creations.map(item => item.ticket).sort((a, b) => a.id.localeCompare(b.id));
    assert.deepEqual(tickets.map(ticket => [ticket.id, ticket.assignee]), [['AUR-202611-0001', 'agente1'], ['AUR-202611-0002', 'agente2']]);
    for (const { reader } of held) assert.match((await reader.read()).value, /"revision":[23]/);
    for (const { controller } of held) controller.abort();
    const replay = await create(agent1, 'parallel-key-01', input, 200);
    assert.equal(replay.ticket.id, creations[0].ticket.id);
    const first = tickets[0];
    const update = (token, status, expected, version = first.version) => json(server, 'tickets/' + first.id, { token, method: 'PATCH', data: { action: 'status', status, version } }, expected);
    await update(agent2, 'En proceso', 403);
    const writes = await Promise.all([agent1, coord].map(token => request(server, 'tickets/' + first.id, { token, method: 'PATCH', data: { action: 'status', status: 'En proceso', version: first.version } })));
    assert.deepEqual(writes.map(response => response.status).sort(), [200, 409]);
    for (const response of writes) await response.json();
    const changed = (await json(server, 'state', { token: coord })).tickets.find(ticket => ticket.id === first.id);
    const reassigned = (await json(server, 'tickets/' + first.id, {
      method: 'PATCH', token: coord, data: { action: 'assign', assignee: 'agente3', version: changed.version },
    })).ticket;
    await update(agent1, 'Pendiente ventas', 403, reassigned.version);
    const history = (await json(server, 'state', { token: coord })).events.findLast(event => event.ticketId === first.id);
    assert.deepEqual([history.action, history.actor, history.previousAssignee, history.assignee], ['Reasignación', 'coordinador', 'agente1', 'agente3']);

    await json(server, 'customers/import', { method: 'POST', token: coord, data: { format: 'json', content: '[{"nit":"090000001","razon_social":"Colegio Renovado"}]' } });
    const backup = await json(server, 'backup', { token: coord });
    assert.equal(backup.customers.length, 2);
    assert.equal(backup.tickets.find(ticket => ticket.id === first.id).customer, 'Colegio, Norte');
    assert.equal('users' in backup, false);

    const third = await create(agent1, 'persistent-key-03');
    let snapshot = await json(server, 'state', { token: coord });
    await json(server, 'restore', { method: 'POST', token: coord, data: { backup: { schema: 1 }, confirmed: true, revision: snapshot.revision } }, 422);
    const validVersionBeforeRestore = snapshot.tickets.find(ticket => ticket.id === first.id).version;
    await json(server, 'restore', { method: 'POST', token: coord, data: { backup, confirmed: true, revision: snapshot.revision } });
    await update(coord, 'Pendiente ventas', 409, validVersionBeforeRestore);
    assert.equal((await json(server, 'state', { token: coord })).tickets.length, 2);
    assert.equal((await create(agent1, 'persistent-key-03', input, 409)).error.includes(third.ticket.id), true);
    assert.ok((await readdir(join(directory, 'respaldos'))).length >= 1);
    const fourth = await create(agent1, 'persistent-key-04');
    assert.ok(fourth.ticket.id.endsWith('0004'));
    snapshot = await json(server, 'state', { token: coord });

    await stop(server);
    server = await listen(directory, clock);
    const freshToken = await login(server, 'coordinador');
    const restarted = await json(server, 'state', { token: freshToken });
    assert.deepEqual(restarted.tickets, snapshot.tickets);
    assert.deepEqual(restarted.events, snapshot.events);

    const file = join(directory, 'solicitudes.json'), parked = join(directory, 'solicitudes-original.json');
    await rename(file, parked);
    await mkdir(file);
    await create(freshToken, 'failing-write-05', input, 503);
    assert.deepEqual((await json(server, 'state', { token: freshToken })).tickets, restarted.tickets);
    await rm(file, { recursive: true });
    await rename(parked, file);
    const recovered = await create(freshToken, 'failing-write-05');
    assert.ok(recovered.ticket.id.endsWith('0005'));
    assert.equal(JSON.parse(await readFile(file, 'utf8')).tickets[0].id, recovered.ticket.id);
  } finally {
    for (const { controller } of held) controller.abort();
    if (server.listening) await stop(server);
    await rm(directory, { recursive: true, force: true });
  }
});

test('la expiración termina el acceso a la bandeja y al flujo', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'aurora-exp-'));
  let time = Date.now();
  const server = await listen(directory, () => new Date(time), 1000);
  try {
    const token = await login(server, 'agente1');
    time += 1000;
    await json(server, 'state', { token }, 401);
    await json(server, 'events', { token }, 401);
  } finally {
    await stop(server);
    await rm(directory, { recursive: true, force: true });
  }
});
