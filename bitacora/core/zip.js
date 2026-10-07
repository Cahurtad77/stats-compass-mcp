// Generador ZIP mínimo (método "store", sin compresión): suficiente para empaquetar CSV y fotos,
// que ya vienen comprimidas. Funciona en navegador y en Node (para pruebas).

const TABLA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLA[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const fechaDos = (d) => ({
  hora: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
  dia: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
});

// archivos: [{ nombre: 'carpeta/archivo.csv', datos: Uint8Array | string }]
export function crearZip(archivos, fecha = new Date()) {
  const enc = new TextEncoder();
  const { hora, dia } = fechaDos(fecha);
  const locales = [], centrales = [];
  let desplazamiento = 0;
  for (const a of archivos) {
    const nombre = enc.encode(a.nombre);
    const datos = typeof a.datos === 'string' ? enc.encode(a.datos) : a.datos;
    const crc = crc32(datos);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); // UTF-8
    local.setUint16(8, 0, true); local.setUint16(10, hora, true); local.setUint16(12, dia, true);
    local.setUint32(14, crc, true); local.setUint32(18, datos.length, true); local.setUint32(22, datos.length, true);
    local.setUint16(26, nombre.length, true); local.setUint16(28, 0, true);
    locales.push(new Uint8Array(local.buffer), nombre, datos);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true); central.setUint16(4, 20, true); central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true); central.setUint16(10, 0, true); central.setUint16(12, hora, true); central.setUint16(14, dia, true);
    central.setUint32(16, crc, true); central.setUint32(20, datos.length, true); central.setUint32(24, datos.length, true);
    central.setUint16(28, nombre.length, true); central.setUint32(42, desplazamiento, true);
    centrales.push(new Uint8Array(central.buffer), nombre);
    desplazamiento += 30 + nombre.length + datos.length;
  }
  const tamCentral = centrales.reduce((t, b) => t + b.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tamCentral, true); fin.setUint32(16, desplazamiento, true);
  const partes = [...locales, ...centrales, new Uint8Array(fin.buffer)];
  const salida = new Uint8Array(partes.reduce((t, b) => t + b.length, 0));
  let i = 0;
  for (const b of partes) { salida.set(b, i); i += b.length; }
  return salida;
}
