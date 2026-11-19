import { randomUUID } from 'node:crypto';

export const channels = ['Mensajería', 'Correo electrónico', 'Llamada telefónica'];
export const categories = ['Consulta de stock', 'Estado del pedido', 'Inconformidad de envío', 'Facturación y cobro', 'Devolución'];
export const transitions = {
  'Nuevo': ['En proceso', 'Pendiente logística', 'Pendiente ventas', 'Resuelto'],
  'En proceso': ['Pendiente logística', 'Pendiente ventas', 'Resuelto'],
  'Pendiente logística': ['En proceso', 'Pendiente ventas', 'Resuelto'],
  'Pendiente ventas': ['En proceso', 'Pendiente logística', 'Resuelto'],
  'Resuelto': ['Cerrado'],
  'Cerrado': [],
};
export const open = status => Object.hasOwn(transitions, status) && status !== 'Resuelto' && status !== 'Cerrado';
export const hours48 = 48 * 60 * 60 * 1000;
const colombiaMonth = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', timeZone: 'America/Bogota' });
const ticketPattern = /^AUR-(\d{4}(?:0[1-9]|1[0-2]))-(\d{4})$/;
const datePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
export const text = value => typeof value === 'string' ? value.trim() : '';

export class Problem extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export function monthKey(date) {
  const parts = colombiaMonth.formatToParts(date);
  return parts.find(part => part.type === 'year').value + parts.find(part => part.type === 'month').value;
}

export function emptyState() {
  return { schema: 1, revision: 0, epoch: randomUUID(), lastAgent: null, counters: {}, customers: [], tickets: [], events: [], retries: [], restorations: [] };
}

export function createTicket(state, input, actor, agents, now, key) {
  if (!/^[\w-]{12,100}$/.test(key)) throw new Problem(400, 'Falta una clave de radicación válida.');
  const { channel, category } = input;
  const nit = text(input.nit);
  const description = text(input.description);
  const order = text(input.order);
  const fingerprint = JSON.stringify([nit, channel, category, description, order]);
  const previous = state.retries.find(item => item.key === key && item.actor === actor);
  if (previous) {
    if (previous.fingerprint !== fingerprint) throw new Problem(409, 'Esta clave pertenece a otra radicación.');
    const ticket = state.tickets.find(item => item.id === previous.id);
    if (!ticket) throw new Problem(409, 'El radicado ' + previous.id + ' quedó fuera de la restauración. Revisa el respaldo antes de volver a radicar.');
    return { ticket, repeated: true };
  }
  const customer = state.customers.find(item => item.nit === nit);
  const fields = {};
  if (!customer) fields.nit = 'Selecciona un cliente existente.';
  if (!channels.includes(channel)) fields.channel = 'Selecciona el canal de recepción.';
  if (!categories.includes(category)) fields.category = 'Selecciona una categoría.';
  if (description.length < 10 || description.length > 4000) fields.description = 'Escribe entre 10 y 4.000 caracteres.';
  if (order.length > 120) fields.order = 'La referencia admite hasta 120 caracteres.';
  if (Object.keys(fields).length) throw new Problem(422, 'Revisa los campos marcados.', { fields });
  const next = [...agents, ...agents].slice(agents.findIndex(agent => agent.id === state.lastAgent) + 1).find(agent => agent.active);
  if (!next) throw new Problem(409, 'No hay agentes activos para asignar la solicitud.');
  const month = monthKey(now);
  const sequence = (state.counters[month] ?? 0) + 1;
  if (sequence > 9999) throw new Problem(409, 'Se agotaron los consecutivos de este mes.');
  const id = 'AUR-' + month + '-' + String(sequence).padStart(4, '0');
  const ticket = { id, nit, customer: customer.name, channel, category, description, order, assignee: next.id, status: 'Nuevo',
    receivedAt: now.toISOString(), dueAt: new Date(now.getTime() + hours48).toISOString(), resolvedAt: null,
    elapsedHours: null, withinSla: null, response: null, version: randomUUID() };
  state.counters[month] = sequence;
  state.lastAgent = next.id;
  state.tickets.unshift(ticket);
  state.events.push(event(id, actor, now, 'Radicación', { to: ticket.status, assignee: next.id }));
  state.retries.push({ key, actor, fingerprint, id });
  return { ticket, repeated: false };
}

function event(ticketId, actor, now, action, changes) {
  return { id: randomUUID(), ticketId, actor, at: now.toISOString(), action, ...changes };
}

export function updateTicket(state, id, input, user, agents, now) {
  const ticket = state.tickets.find(item => item.id === id);
  if (!ticket) throw new Problem(404, 'La solicitud no está disponible.');
  if (user.role !== 'coordinador' && ticket.assignee !== user.id) throw new Problem(403, 'Solo puedes editar solicitudes asignadas a ti.');
  if (ticket.version !== input.version) throw new Problem(409, 'La solicitud cambió. Revisa su estado vigente antes de reenviar.', { ticket });
  const comment = text(input.comment);
  if (comment.length > 4000) throw new Problem(422, 'El comentario admite hasta 4.000 caracteres.');
  if (input.action === 'assign') {
    if (user.role !== 'coordinador') throw new Problem(403, 'Solo coordinación puede reasignar.');
    if (!open(ticket.status) || !agents.some(agent => agent.active && agent.id === input.assignee) || ticket.assignee === input.assignee) {
      throw new Problem(422, 'Selecciona otro agente activo para la solicitud abierta.');
    }
    state.events.push(event(id, user.id, now, 'Reasignación', { previousAssignee: ticket.assignee, assignee: input.assignee, comment }));
    ticket.assignee = input.assignee;
  } else if (input.action === 'status') {
    if (!transitions[ticket.status].includes(input.status)) throw new Problem(422, 'La transición de estado no está permitida.');
    if (input.status === 'Resuelto') {
      if (!comment) throw new Problem(422, 'Escribe la respuesta de fondo para resolver la solicitud.');
      ticket.resolvedAt = now.toISOString();
      ticket.elapsedHours = (now.getTime() - Date.parse(ticket.receivedAt)) / 3600000;
      ticket.withinSla = now.getTime() <= Date.parse(ticket.dueAt);
      ticket.response = comment;
    }
    state.events.push(event(id, user.id, now, 'Cambio de estado', { from: ticket.status, to: input.status, comment }));
    ticket.status = input.status;
  } else {
    throw new Problem(422, 'Selecciona una acción válida.');
  }
  ticket.version = randomUUID();
  return ticket;
}

function parseCsv(source) {
  const rows = [];
  let row = [], field = '', quoted = false, closed = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char !== '"') field += char;
      else if (source[i + 1] === '"') { field += '"'; i++; }
      else { quoted = false; closed = true; }
      continue;
    }
    if (char === ',' || char === '\n' || char === '\r') {
      row.push(field); field = ''; closed = false;
      if (char !== ',') {
        if (char === '\r' && source[i + 1] === '\n') i++;
        rows.push(row); row = [];
      }
    } else if (char === '"' && !field && !closed) {
      quoted = true;
    } else {
      if (closed || char === '"') throw new Problem(422, 'Comillas inválidas en la fila ' + (rows.length + 1) + '.');
      field += char;
    }
  }
  if (quoted) throw new Problem(422, 'Comillas sin cerrar en la fila ' + (rows.length + 1) + '.');
  if (field || row.length || closed) rows.push([...row, field]);
  const header = rows.shift()?.map(cell => cell.trim().toLowerCase()) ?? [];
  const nit = header.indexOf('nit');
  const name = header.findIndex(cell => ['name', 'razon_social', 'razón social'].includes(cell));
  if (nit < 0 || name < 0) throw new Problem(422, 'El CSV requiere las columnas nit y razon_social.');
  return rows.map((cells, i) => ({ nit: cells[nit], name: cells[name], row: i + 2 }));
}

export function importCustomers(state, format, content) {
  if (typeof content !== 'string') throw new Problem(422, 'Selecciona un archivo CSV o JSON.');
  const source = content.replace(/^\uFEFF/, '');
  let rows;
  if (format === 'csv') rows = parseCsv(source);
  else if (format === 'json') {
    try { rows = JSON.parse(source); } catch { throw new Problem(422, 'El archivo JSON no es válido.'); }
  }
  if (!Array.isArray(rows) || !rows.length || rows.length > 10000) throw new Problem(422, 'Importa entre 1 y 10.000 clientes.');
  const seen = new Set();
  const issues = [];
  const updates = new Map(state.customers.map(customer => [customer.nit, customer]));
  rows.forEach((row, index) => {
    const nit = text(row?.nit);
    const name = text(row?.name ?? row?.razon_social);
    if (!/^[\d-]{1,24}$/.test(nit) || !/\d/.test(nit) || !name || name.length > 200 || seen.has(nit)) {
      issues.push(format === 'csv' ? row.row : index + 1);
      return;
    }
    seen.add(nit);
    updates.set(nit, { nit, name });
  });
  if (issues.length) throw new Problem(422, 'NIT inválido, duplicado o razón social incompleta en las filas: ' + issues.slice(0, 30).join(', ') + (issues.length > 30 ? '…' : '') + '.');
  state.customers = [...updates.values()];
  return { count: rows.length };
}

export function validateBackup(state, users) {
  const validDate = value => typeof value === 'string' && datePattern.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
  const usersById = new Map(users.map(user => [user.id, user]));
  const isAgent = id => usersById.get(id)?.role === 'agente';
  function require(condition) {
    if (!condition) throw new Problem(422, 'El respaldo tiene una estructura o referencias inconsistentes.');
  }
  function fields(value, names) {
    return value && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).every(key => names.includes(key));
  }
  require(fields(state, ['schema', 'revision', 'epoch', 'lastAgent', 'counters', 'customers', 'tickets', 'events', 'retries', 'restorations']));
  require(state?.schema === 1 && Number.isSafeInteger(state.revision) && state.revision >= 0 && typeof state.epoch === 'string');
  require((state.lastAgent === null || isAgent(state.lastAgent)) && state.counters && Object.getPrototypeOf(state.counters) === Object.prototype);
  require(Object.entries(state.counters).every(([key, number]) => /^\d{4}(0[1-9]|1[0-2])$/.test(key) && Number.isInteger(number) && number >= 0 && number <= 9999));
  require(['customers', 'tickets', 'events', 'retries', 'restorations'].every(key => Array.isArray(state[key])));
  const nits = new Set();
  for (const customer of state.customers) {
    require(fields(customer, ['nit', 'name']) && typeof customer.nit === 'string' && /^(?=.*\d)[\d-]{1,24}$/.test(customer.nit) && text(customer.name) && !nits.has(customer.nit));
    nits.add(customer.nit);
  }
  const tickets = new Map();
  for (const ticket of state.tickets) {
    require(fields(ticket, ['id', 'nit', 'customer', 'channel', 'category', 'description', 'order', 'assignee', 'status', 'receivedAt', 'dueAt',
      'resolvedAt', 'elapsedHours', 'withinSla', 'response', 'version']));
    const parts = typeof ticket?.id === 'string' && ticket.id.match(ticketPattern);
    require(parts && Number(parts[2]) > 0 && Number(parts[2]) <= state.counters[parts[1]] && !tickets.has(ticket.id));
    require(nits.has(ticket.nit) && text(ticket.customer) && isAgent(ticket.assignee) && Object.hasOwn(transitions, ticket.status));
    require(channels.includes(ticket.channel) && categories.includes(ticket.category) && text(ticket.description).length >= 10 && typeof ticket.order === 'string');
    require(text(ticket.version) && validDate(ticket.receivedAt) && validDate(ticket.dueAt));
    require(parts[1] === monthKey(new Date(ticket.receivedAt)) && Date.parse(ticket.dueAt) - Date.parse(ticket.receivedAt) === hours48);
    if (open(ticket.status)) require(ticket.resolvedAt === null && ticket.elapsedHours === null && ticket.withinSla === null && ticket.response === null);
    else {
      const elapsed = Date.parse(ticket.resolvedAt) - Date.parse(ticket.receivedAt);
      require(validDate(ticket.resolvedAt) && elapsed >= 0 && text(ticket.response) && ticket.elapsedHours === elapsed / 3600000 && ticket.withinSla === (elapsed <= hours48));
    }
    tickets.set(ticket.id, ticket);
  }
  const eventIds = new Set();
  const history = new Map();
  for (const entry of state.events) {
    require(fields(entry, ['id', 'ticketId', 'actor', 'at', 'action', 'from', 'to', 'comment', 'assignee', 'previousAssignee']) &&
      text(entry.id) && !eventIds.has(entry.id) && tickets.has(entry.ticketId) && usersById.has(entry.actor) && validDate(entry.at));
    require(['Radicación', 'Cambio de estado', 'Reasignación'].includes(entry.action));
    const current = history.get(entry.ticketId);
    if (entry.action === 'Radicación') {
      require(entry.to === 'Nuevo' && isAgent(entry.assignee) && !current && tickets.get(entry.ticketId).receivedAt === entry.at);
      history.set(entry.ticketId, { status: entry.to, assignee: entry.assignee, resolvedAt: null, response: null });
    } else if (entry.action === 'Cambio de estado') {
      require(current && current.status === entry.from && transitions[entry.from].includes(entry.to) && typeof entry.comment === 'string');
      if (entry.to === 'Resuelto') {
        require(text(entry.comment));
        current.resolvedAt = entry.at;
        current.response = entry.comment;
      }
      current.status = entry.to;
    } else {
      require(current && open(current.status) && isAgent(entry.assignee) && current.assignee === entry.previousAssignee && typeof entry.comment === 'string');
      current.assignee = entry.assignee;
    }
    eventIds.add(entry.id);
  }
  for (const [id, ticket] of tickets) {
    const current = history.get(id);
    require(current && current.status === ticket.status && current.assignee === ticket.assignee && current.resolvedAt === ticket.resolvedAt && current.response === ticket.response);
  }
  const retries = new Set();
  for (const entry of state.retries) {
    require(fields(entry, ['key', 'actor', 'fingerprint', 'id']) && typeof entry.key === 'string' && /^[\w-]{12,100}$/.test(entry.key) &&
      usersById.has(entry.actor) && typeof entry.fingerprint === 'string');
    const parts = typeof entry.id === 'string' && entry.id.match(ticketPattern);
    require(parts && Number(parts[2]) > 0 && Number(parts[2]) <= state.counters[parts[1]]);
    const signature = entry.actor + '/' + entry.key;
    require(!retries.has(signature));
    retries.add(signature);
  }
  require(state.restorations.every(entry => fields(entry, ['actor', 'at']) && usersById.get(entry.actor)?.role === 'coordinador' && validDate(entry.at)));
}
