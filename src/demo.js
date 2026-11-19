import { profiles, passwordRecord } from './accounts.js';
import { channels, categories, createTicket, emptyState, hours48, updateTicket } from './domain.js';

export const demoPassword = 'Aurora-piloto-2026';

export function demoAccounts() {
  return profiles.map(profile => ({ ...profile, active: true, ...passwordRecord(demoPassword) }));
}

export function demoState(users, today = new Date()) {
  const state = emptyState();
  const teams = ['Colegio', 'Papelería', 'Fundación', 'Academia', 'Oficinas', 'Centro educativo'];
  const names = ['Los Arrayanes', 'El Nogal', 'San Gabriel', 'La Sabana', 'Santa Lucía', 'Monteverde', 'El Prado', 'La Colina', 'San Rafael', 'Bosques del Norte'];
  const agents = users.filter(user => user.role === 'agente');
  const coord = users.find(user => user.role === 'coordinador');
  state.customers = Array.from({ length: 300 }, (_, i) => ({
    nit: String(900610001 + i),
    name: teams[i % teams.length] + ' ' + names[Math.floor(i / teams.length) % names.length] + (i >= 60 ? ' · Sede ' + (Math.floor(i / 60) + 1) : ''),
  }));
  for (let i = 0; i < 600; i++) {
    const date = new Date(today.getTime() - (602 - i) * 3600000);
    const customer = state.customers[i % state.customers.length];
    const { ticket } = createTicket(state, {
      nit: customer.nit, channel: channels[i % channels.length], category: categories[i % categories.length],
      description: ['El cliente solicita confirmar la disponibilidad para su próximo pedido.', 'El cliente solicita una actualización sobre la entrega de sus suministros.', 'El cliente requiere seguimiento de una novedad reportada.'][i % 3],
      order: 'PED-' + (10400 + i),
    }, agents[i % agents.length].id, agents, date, 'demo-radicado-' + i);
    let status = i < 576 && i % 8 < 5 ? 'Resuelto' : ['Nuevo', 'En proceso', 'Pendiente logística', 'Pendiente ventas'][i % 4];
    if (status !== 'Nuevo') {
      const offset = status === 'Resuelto' ? (i % 13 === 0 ? hours48 + 3600000 : (8 + i % 33) * 3600000) : 3600000;
      const time = new Date(date.getTime() + Math.min(offset, today.getTime() - date.getTime()));
      updateTicket(state, ticket.id, { action: 'status', status, comment: 'Se confirmó la atención con el cliente.', version: ticket.version }, coord, agents, time);
      if (status === 'Resuelto' && i % 4 === 0) {
        updateTicket(state, ticket.id, { action: 'status', status: 'Cerrado', version: ticket.version }, coord, agents, time);
      }
    }
  }
  return state;
}
