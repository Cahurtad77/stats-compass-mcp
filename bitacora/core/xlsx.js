// Lector mínimo de .xlsx (primera hoja → matriz de textos). Sin librerías: un .xlsx es un ZIP con XML;
// se descomprime con DecompressionStream('deflate-raw'), disponible en navegadores modernos y en Node 18+.
// No soporta el formato antiguo .xls (binario): en ese caso hay que guardarlo como .xlsx o .csv.

async function inflar(datos) {
  const flujo = new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}

async function descomprimir(buffer) {
  const v = new DataView(buffer), bytes = new Uint8Array(buffer);
  let fin = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { fin = i; break; }
  if (fin < 0) throw new Error('El archivo no es un Excel .xlsx válido (si es .xls antiguo, guárdalo como .xlsx o .csv).');
  const total = v.getUint16(fin + 10, true);
  let p = v.getUint32(fin + 16, true);
  const archivos = {}, dec = new TextDecoder();
  for (let n = 0; n < total; n++) {
    const metodo = v.getUint16(p + 10, true), tam = v.getUint32(p + 20, true);
    const lnom = v.getUint16(p + 28, true), lext = v.getUint16(p + 30, true), lcom = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const nombre = dec.decode(bytes.subarray(p + 46, p + 46 + lnom));
    const inicio = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    archivos[nombre] = { metodo, datos: bytes.subarray(inicio, inicio + tam) };
    p += 46 + lnom + lext + lcom;
  }
  return async (nombre) => {
    const a = archivos[nombre];
    if (!a) return null;
    return dec.decode(a.metodo === 8 ? await inflar(a.datos) : a.datos);
  };
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const desescapar = (t) => t.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e] ?? m));
const textoDe = (xml) => desescapar([...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));
const columna = (ref) => [...ref.replace(/\d+/g, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

export async function leerXlsx(buffer) {
  const leer = await descomprimir(buffer);
  const compartidos = [];
  const ss = await leer('xl/sharedStrings.xml');
  if (ss) for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) compartidos.push(textoDe(m[1]));
  // Primera hoja según el libro (no siempre se llama sheet1.xml)
  let ruta = 'xl/worksheets/sheet1.xml';
  const libro = await leer('xl/workbook.xml'), rels = await leer('xl/_rels/workbook.xml.rels');
  const rid = libro?.match(/<sheet\b[^>]*r:id="([^"]+)"/)?.[1];
  const destino = rid && rels?.match(new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`))?.[1]
    || rid && rels?.match(new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`))?.[1];
  if (destino) ruta = destino.startsWith('/') ? destino.slice(1) : `xl/${destino.replace(/^\.\//, '')}`;
  const hoja = await leer(ruta);
  if (!hoja) throw new Error('No encontré la hoja de cálculo dentro del archivo.');
  const filas = [];
  for (const mf of hoja.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const fila = [];
    for (const mc of mf[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = mc[1], cuerpo = mc[2] || '';
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
      const t = attrs.match(/\bt="(\w+)"/)?.[1];
      const v = cuerpo.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let valor = '';
      if (t === 's') valor = compartidos[+v] ?? '';
      else if (t === 'inlineStr') valor = textoDe(cuerpo);
      else if (v != null) valor = desescapar(v);
      fila[ref ? columna(ref) : fila.length] = valor;
    }
    filas.push(Array.from(fila, (x) => x ?? ''));
  }
  return filas.filter((f) => f.some((x) => String(x).trim() !== ''));
}
