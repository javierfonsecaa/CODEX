import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { emptyState, Problem, validateBackup } from './domain.js';

async function saveJson(path, value) {
  const temp = path + '.' + randomUUID() + '.tmp';
  try {
    const handle = await open(temp, 'wx', 0o600);
    try {
      await handle.writeFile(JSON.stringify(value));
      await handle.sync();
    } finally { await handle.close(); }
    await rename(temp, path);
  } finally {
    await rm(temp, { force: true }).catch(error => console.error('No se pudo retirar un temporal:', error.code));
  }
}

export async function loadStore(directory, users, initial = emptyState(), clock = () => new Date()) {
  const path = join(directory, 'solicitudes.json');
  const backups = join(directory, 'respaldos');
  await mkdir(backups, { recursive: true, mode: 0o700 });
  let state;
  try {
    state = JSON.parse(await readFile(path, 'utf8'));
    validateBackup(state, users);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    state = initial;
    validateBackup(state, users);
    await saveJson(path, state);
  }

  let queue = Promise.resolve();
  let backupDay;
  function transact(fn, restoring = false) {
    const operation = queue.then(async () => {
      const draft = structuredClone(state);
      const outcome = fn(draft);
      if (outcome.unchanged) return outcome.value;
      const next = outcome.state ?? draft;
      next.revision = state.revision + 1;
      const day = clock().toISOString().slice(0, 10);
      try {
        if (restoring || (backupDay !== day && state.revision > 0)) {
          await saveJson(join(backups, clock().toISOString().replace(/:/g, '-') + '-' + randomUUID() + '.json'), state);
          backupDay = day;
        }
        await saveJson(path, next);
      } catch (error) {
        console.error('Error de escritura:', error.code);
        throw new Problem(503, 'No se pudo guardar. El estado confirmado se conserva.');
      }
      state = next;
      return outcome.value;
    });
    queue = operation.catch(() => {});
    return operation;
  }

  function restore(source, expectedRevision, user) {
    const backup = structuredClone(source);
    validateBackup(backup, users);
    return transact(current => {
      if (current.revision !== expectedRevision) throw new Problem(409, 'Los datos cambiaron. Revisa y confirma de nuevo la restauración.');
      backup.epoch = randomUUID();
      for (const ticket of backup.tickets) ticket.version = randomUUID();
      for (const [month, count] of Object.entries(current.counters)) {
        backup.counters[month] = Math.max(count, backup.counters[month] ?? 0);
      }
      const retries = new Map(backup.retries.map(entry => [entry.actor + '/' + entry.key, entry]));
      for (const entry of current.retries) retries.set(entry.actor + '/' + entry.key, entry);
      backup.retries = [...retries.values()];
      backup.restorations = [...current.restorations, { actor: user, at: clock().toISOString() }];
      return { state: backup, value: { restored: true } };
    }, true);
  }

  return { read: () => state, transact, restore };
}
