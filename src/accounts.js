import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const profiles = [
  { id: 'agente1', name: 'Mariana Torres', role: 'agente' },
  { id: 'agente2', name: 'Andrés Rojas', role: 'agente' },
  { id: 'agente3', name: 'Laura Gómez', role: 'agente' },
  { id: 'agente4', name: 'Felipe Castro', role: 'agente' },
  { id: 'coordinador', name: 'Sofía Ramírez', role: 'coordinador' },
];

export function passwordRecord(password) {
  const salt = randomBytes(16).toString('hex');
  return { salt, hash: scryptSync(password, salt, 64).toString('hex') };
}

export function matchesPassword(password, record) {
  const candidate = scryptSync(password, record.salt, 64);
  return timingSafeEqual(candidate, Buffer.from(record.hash, 'hex'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const directory = resolve(process.env.AURORA_DATA_DIR || 'data/piloto');
  const path = resolve(process.env.AURORA_ACCOUNTS || directory + '/accounts.json');
  const delivery = resolve(process.argv[2] || directory + '/credenciales.txt');
  if (path === delivery) throw new Error('Usa archivos distintos para las cuentas y las credenciales.');
  const credentials = Object.fromEntries(profiles.map(({ id }) => [id, randomBytes(18).toString('base64url')]));
  const records = profiles.map(profile => ({ ...profile, active: true, ...passwordRecord(credentials[profile.id]) }));
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await mkdir(dirname(delivery), { recursive: true, mode: 0o700 });
  await writeFile(delivery, Object.entries(credentials).map(([id, password]) => id + '\t' + password).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
  try {
    await writeFile(path, JSON.stringify(records, null, 2), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    await rm(delivery, { force: true });
    throw error;
  }
  console.log('Cinco cuentas creadas. Archivo privado de entrega: ' + delivery);
}
