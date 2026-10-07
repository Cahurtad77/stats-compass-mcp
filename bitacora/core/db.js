// Almacenamiento local-first sobre IndexedDB. Los datos nunca salen del dispositivo
// salvo que el usuario exporte un respaldo. Si IndexedDB no está disponible
// (navegación privada estricta), se usa memoria y se avisa en la interfaz.

const NOMBRE = 'bitacora';
const VERSION = 1;
export const ALMACENES = ['cuentas', 'asientos', 'presupuestos', 'recurrentes', 'reglas', 'ajustes'];

let db = null;
const memoria = Object.fromEntries(ALMACENES.map((a) => [a, new Map()]));
export let persistente = true;

export async function abrir() {
  if (db) return db;
  try {
    db = await new Promise((ok, mal) => {
      const req = indexedDB.open(NOMBRE, VERSION);
      req.onupgradeneeded = () => {
        for (const a of ALMACENES) if (!req.result.objectStoreNames.contains(a)) {
          const s = req.result.createObjectStore(a, { keyPath: 'id' });
          if (a === 'asientos') s.createIndex('fecha', 'fecha');
        }
      };
      req.onsuccess = () => ok(req.result);
      req.onerror = () => mal(req.error);
    });
  } catch {
    persistente = false;
  }
  return db;
}

const tx = (almacen, modo, fn) => new Promise((ok, mal) => {
  const t = db.transaction(almacen, modo);
  const r = fn(t.objectStore(almacen));
  t.oncomplete = () => ok(r?.result);
  t.onerror = () => mal(t.error);
});

export const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export async function todos(almacen) {
  if (!persistente) return [...memoria[almacen].values()];
  return tx(almacen, 'readonly', (s) => s.getAll());
}

export async function guardar(almacen, obj) {
  const doc = { ...obj, id: obj.id || nuevoId(), actualizado: new Date().toISOString() };
  if (!persistente) memoria[almacen].set(doc.id, doc);
  else await tx(almacen, 'readwrite', (s) => s.put(doc));
  return doc;
}

export async function guardarVarios(almacen, lista) {
  const docs = lista.map((o) => ({ ...o, id: o.id || nuevoId(), actualizado: new Date().toISOString() }));
  if (!persistente) docs.forEach((d) => memoria[almacen].set(d.id, d));
  else await tx(almacen, 'readwrite', (s) => docs.forEach((d) => s.put(d)));
  return docs;
}

export async function borrar(almacen, id) {
  if (!persistente) memoria[almacen].delete(id);
  else await tx(almacen, 'readwrite', (s) => s.delete(id));
}

export async function vaciar(almacen) {
  if (!persistente) memoria[almacen].clear();
  else await tx(almacen, 'readwrite', (s) => s.clear());
}

export async function respaldo() {
  const datos = {};
  for (const a of ALMACENES) datos[a] = await todos(a);
  return { app: 'bitacora', version: VERSION, exportado: new Date().toISOString(), datos };
}

export async function restaurar(json) {
  if (json?.app !== 'bitacora' || !json.datos) throw new Error('El archivo no es un respaldo de Bitácora.');
  for (const a of ALMACENES) {
    await vaciar(a);
    if (Array.isArray(json.datos[a])) await guardarVarios(a, json.datos[a]);
  }
}

export async function ajuste(clave, porDefecto) {
  const r = (await todos('ajustes')).find((x) => x.id === clave);
  return r ? r.valor : porDefecto;
}
export const fijarAjuste = (clave, valor) => guardar('ajustes', { id: clave, valor });
