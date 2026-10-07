// Almacenamiento local-first sobre IndexedDB. Los datos nunca salen del dispositivo
// salvo que el usuario exporte un respaldo. Si IndexedDB no está disponible
// (navegación privada estricta), se usa memoria y se avisa en la interfaz.

const NOMBRE = 'bitacora';
const VERSION = 3;
export const ALMACENES = ['cuentas', 'asientos', 'presupuestos', 'recurrentes', 'reglas', 'ajustes', 'soportes', 'metas', 'importacion', 'lotes'];
// Ajustes sensibles que nunca salen en un respaldo.
const PRIVADOS = new Set(['ia_clave']);

let db = null;
const memoria = Object.fromEntries(ALMACENES.map((a) => [a, new Map()]));
export let persistente = true;

export async function abrir() {
  if (db) return db;
  try {
    db = await new Promise((ok, mal) => {
      // Si el navegador no responde (marcos aislados, modo privado estricto), se usa memoria tras 3 s.
      setTimeout(() => mal(new Error('IndexedDB no respondió')), 3000);
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
    db = null;
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

export async function borrarVarios(almacen, ids) {
  if (!persistente) ids.forEach((id) => memoria[almacen].delete(id));
  else await tx(almacen, 'readwrite', (s) => ids.forEach((id) => s.delete(id)));
}

export async function borrar(almacen, id) {
  if (!persistente) memoria[almacen].delete(id);
  else await tx(almacen, 'readwrite', (s) => s.delete(id));
}

export async function vaciar(almacen) {
  if (!persistente) memoria[almacen].clear();
  else await tx(almacen, 'readwrite', (s) => s.clear());
}

const blobADataURL = (b) => new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => mal(r.error); r.readAsDataURL(b); });
const dataURLABlob = async (u) => (await fetch(u)).blob();

export async function respaldo() {
  const datos = {};
  for (const a of ALMACENES) datos[a] = await todos(a);
  datos.ajustes = datos.ajustes.filter((x) => !PRIVADOS.has(x.id));
  datos.soportes = await Promise.all(datos.soportes.map(async (s) => ({ ...s, archivo: s.archivo ? await blobADataURL(s.archivo) : null })));
  return { app: 'bitacora', version: VERSION, exportado: new Date().toISOString(), datos };
}

export async function restaurar(json) {
  if (json?.app !== 'bitacora' || !json.datos) throw new Error('El archivo no es un respaldo de Bitácora.');
  const clave = await ajuste('ia_clave', null);
  // Convertir todo antes de borrar: si algo falla, los datos actuales quedan intactos.
  const listas = {};
  for (const a of ALMACENES) {
    listas[a] = Array.isArray(json.datos[a]) ? json.datos[a] : [];
    if (a === 'soportes') listas[a] = await Promise.all(listas[a].map(async (s) => ({ ...s, archivo: s.archivo ? await dataURLABlob(s.archivo) : null })));
  }
  for (const a of ALMACENES) {
    await vaciar(a);
    if (listas[a].length) await guardarVarios(a, listas[a]);
  }
  if (clave) await fijarAjuste('ia_clave', clave);
}

export async function ajuste(clave, porDefecto) {
  const r = (await todos('ajustes')).find((x) => x.id === clave);
  return r ? r.valor : porDefecto;
}
export const fijarAjuste = (clave, valor) => guardar('ajustes', { id: clave, valor });
