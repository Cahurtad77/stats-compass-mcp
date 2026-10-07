// Secciones de la Fase 1: Bandeja de soportes (WhatsApp), Fugas, Metas y Contador.
// Reciben el estado y las utilidades del módulo para no duplicar lógica.
import * as L from './ledger.js';
import * as DB from '../../core/db.js';
import { crearZip } from '../../core/zip.js';
import { h, descargar, hoyISO, barraProgreso } from '../../core/ui.js';

const fmt = (c) => L.formatoMoneda(c);
const CACHE_COMPARTIDOS = 'bitacora-compartidos';

// ---------- Bandeja: soportes recibidos ----------

// Mueve lo que llegó por "Compartir" (guardado por el service worker en Cache Storage) a IndexedDB.
export async function importarCompartidos() {
  if (!('caches' in window)) return 0;
  const cache = await caches.open(CACHE_COMPARTIDOS);
  const claves = await cache.keys();
  for (const req of claves) {
    const r = await cache.match(req);
    if (!r) continue;
    const nombre = decodeURIComponent(r.headers.get('x-nombre') || '');
    const texto = decodeURIComponent(r.headers.get('x-texto') || '');
    const esTexto = r.headers.get('x-solo-texto') === '1';
    await DB.guardar('soportes', {
      archivo: esTexto ? null : await r.blob(), nombre, texto, mime: esTexto ? '' : r.headers.get('content-type'),
      recibido: new Date().toISOString(), origen: 'compartido', estado: 'pendiente',
    });
    await cache.delete(req);
  }
  return claves.length;
}

export async function agregarArchivos(archivos) {
  for (const f of archivos) {
    await DB.guardar('soportes', { archivo: f, nombre: f.name, texto: '', mime: f.type, recibido: new Date().toISOString(), origen: 'subido', estado: 'pendiente' });
  }
}

const urls = new Map(); // id → objectURL (se reutiliza mientras la página vive)
export const urlSoporte = (s) => {
  if (!s?.archivo) return '';
  if (!urls.has(s.id)) urls.set(s.id, URL.createObjectURL(s.archivo));
  return urls.get(s.id);
};

const miniatura = (s, clase = 'mini-soporte') => s.archivo && s.mime !== 'application/pdf'
  ? h`<img class="${clase}" src="${urlSoporte(s)}" alt="Soporte ${s.nombre || ''}" loading="lazy">`
  : h`<div class="${clase} doc" aria-hidden="true">${s.archivo ? 'PDF' : '💬'}</div>`;

// Convierte lo que devolvió la IA en un "asiento borrador" que el formulario sabe prellenar.
export function borradorDesdeIA(r, cuentas) {
  const existe = (id) => cuentas.some((c) => c.id === id && c.activa);
  const monto = Math.round((r.total || 0) * 100);
  const pago = { tarjeta_credito: 'tc', efectivo: 'caja' }[r.medio_pago] || 'banco';
  const base = { fecha: /^\d{4}-\d{2}-\d{2}$/.test(r.fecha) ? r.fecha : hoyISO(), descripcion: r.descripcion || '', tercero: r.comercio || '', etiquetas: [] };
  if (!(monto > 0)) return { ...base, tipo: r.tipo === 'ingreso' ? 'ingreso' : 'gasto', partidas: [] };
  if (r.tipo === 'ingreso' && r.rubro === 'honorarios') {
    const bruto = monto + Math.round((r.retencion || 0) * 100);
    return { ...L.honorariosAAsiento({ ...base, bruto, tasaRetencion: bruto ? Math.round(((r.retencion || 0) * 100 / bruto) * 100) / 100 : 0, cliente: base.tercero }), descripcion: base.descripcion };
  }
  if (r.tipo === 'ingreso') return { ...base, tipo: 'ingreso', partidas: [{ cuenta: 'banco', monto }, { cuenta: existe(r.rubro) ? r.rubro : 'otros_ing', monto: -monto }] };
  if (r.tipo === 'transferencia') return { ...base, tipo: 'transferencia', partidas: [{ cuenta: 'tc', monto }, { cuenta: 'banco', monto: -monto }] };
  return { ...base, tipo: 'gasto', partidas: [{ cuenta: existe(r.rubro) ? r.rubro : 'otros_gas', monto }, { cuenta: pago, monto: -monto }] };
}

export function vistaBandeja(estado, { seleccionado, formulario, conIA }) {
  const pendientes = estado.soportes.filter((s) => s.estado === 'pendiente').sort((a, b) => a.recibido.localeCompare(b.recibido));
  const actual = pendientes.find((s) => s.id === seleccionado) || pendientes[0];
  const recientes = estado.soportes.filter((s) => s.estado !== 'pendiente').sort((a, b) => b.recibido.localeCompare(a.recibido)).slice(0, 8);
  return h`<section class="panel">
      <div class="panel-cabeza"><h2>Bandeja de soportes</h2><span class="sutil">${pendientes.length} por clasificar</span></div>
      <p class="sutil">Desde WhatsApp: abre la foto del pago → <strong>Compartir</strong> → <strong>Bitácora</strong>. También puedes subir fotos o PDF aquí.</p>
      <label class="btn-sec archivo">📎 Subir fotos o PDF<input type="file" id="arch-soporte" accept="image/*,application/pdf" multiple hidden></label>
      ${pendientes.length ? h`<div class="tira">${pendientes.map((s) => h`<button class="tira-item ${s.id === actual?.id ? 'activo' : ''}" data-ver-soporte="${s.id}" aria-label="Ver soporte ${s.nombre || ''}">${miniatura(s)}</button>`)}</div>` : ''}
    </section>
    ${actual ? h`<div class="dos-columnas bandeja">
      <section class="panel visor">${actual.archivo
        ? (actual.mime === 'application/pdf' ? h`<object data="${urlSoporte(actual)}" type="application/pdf" class="visor-doc"><a href="${urlSoporte(actual)}" target="_blank" rel="noopener">Abrir PDF</a></object>` : h`<img src="${urlSoporte(actual)}" alt="Soporte" class="visor-img">`)
        : h`<blockquote class="texto-compartido">${actual.texto}</blockquote>`}
        ${actual.texto && actual.archivo ? h`<p class="sutil">Mensaje: ${actual.texto}</p>` : ''}
        <div class="acciones">
          ${actual.archivo ? (conIA
            ? h`<button class="btn" data-leer-ia="${actual.id}">✨ Leer con IA</button>`
            : h`<a class="btn-sec" href="#/finanzas/datos">Activar lectura con IA</a>`) : ''}
          <button class="btn-peligro" data-descartar="${actual.id}">Descartar</button>
        </div>
        ${actual.ia ? h`<p class="sutil">Leído con IA · confianza ${actual.ia.confianza}${actual.ia.observaciones ? ` · ${actual.ia.observaciones}` : ''}</p>` : ''}
      </section>
      <div>${formulario}</div>
    </div>` : h`<div class="vacio"><p>No hay soportes pendientes. 🎉</p></div>`}
    ${recientes.length ? h`<section class="panel"><h2>Clasificados recientemente</h2><div class="tira">
      ${recientes.map((s) => h`<a class="tira-item" href="${s.asientoId ? `#/finanzas/movimientos:${s.asientoId}` : '#/finanzas/bandeja'}" title="${s.estado}">${miniatura(s)}</a>`)}</div></section>` : ''}`;
}

// ---------- Fugas ----------
export function vistaFugas(estado, ignoradas) {
  const hallazgos = L.detectarFugas(estado.asientos, estado.cuentas, hoyISO(), { recurrentesConocidos: estado.recurrentes.map((r) => r.plantilla.descripcion) })
    .filter((f) => !ignoradas.includes(f.titulo));
  const total = hallazgos.reduce((t, f) => t + f.impactoAnual, 0);
  const iconos = { recurrente: '🔁', hormiga: '🐜', anomalia: '📈', financiero: '🏦' };
  return h`<section class="panel"><div class="panel-cabeza"><h2>Fugas de dinero</h2>
      ${hallazgos.length ? h`<span class="neg">≈ ${fmt(total)} al año</span>` : ''}</div>
    <p class="sutil">Revisa cobros que se repiten, compras pequeñas que suman, categorías fuera de su comportamiento habitual (media + 2 desviaciones de los últimos 6 meses) y costos financieros.</p>
    ${hallazgos.length ? hallazgos.map((f) => h`<article class="hallazgo">
        <div class="hallazgo-icono" aria-hidden="true">${iconos[f.tipo]}</div>
        <div><strong>${f.titulo}</strong><p class="sutil">${f.detalle}</p></div>
        <div class="hallazgo-acc"><span class="num neg">${fmt(f.impactoAnual)}/año</span>
          <button class="btn-sec" data-ignorar-fuga="${f.titulo}">Ya lo revisé</button></div></article>`)
      : h`<p class="ok-caja">No encontré fugas con los datos actuales. Entre más movimientos registres, mejor funciona.</p>`}
    ${ignoradas.length ? h`<p class="sutil"><button class="icono" data-restaurar-fugas>↺</button> ${ignoradas.length} hallazgo(s) marcados como revisados.</p>` : ''}
  </section>`;
}

// ---------- Metas ----------
const TIPOS_META = {
  vacaciones: ['✈️', 'Vacaciones'], inversion: ['📈', 'Inversión'], apoyo: ['🤝', 'Apoyo a mamá'],
  familia: ['🏡', 'Familia'], emergencia: ['🛟', 'Fondo de emergencia'], otro: ['🎯', 'Otra meta'],
};

export function metasSugeridas(anio) {
  return [
    { nombre: `Vacaciones ${anio + 1}`, tipo: 'vacaciones', objetivo: 8_000_000_00, fecha: `${anio + 1}-06-30`,
      partes: [{ nombre: 'tiquetes', monto: 3_000_000_00 }, { nombre: 'hospedaje', monto: 2_500_000_00 }, { nombre: 'comida', monto: 1_500_000_00 }, { nombre: 'actividades', monto: 1_000_000_00 }] },
    { nombre: `Apoyo a mamá ${anio}`, tipo: 'apoyo', objetivo: 9_600_000_00, fecha: `${anio}-12-31`, cuentaGasto: 'apoyo_mama' },
    { nombre: 'Fondo de emergencia (6 meses)', tipo: 'emergencia', objetivo: 30_000_000_00, fecha: `${anio + 1}-12-31` },
    { nombre: 'Portafolio de inversión', tipo: 'inversion', objetivo: 50_000_000_00, fecha: `${anio + 3}-12-31`, tasaEA: 0.1 },
  ];
}

export function vistaMetas(estado) {
  const hoy = hoyISO();
  const tarjetas = estado.metas.map((m) => {
    const e = L.estadoMeta(m, estado.asientos, estado.cuentas, hoy);
    const [icono, nombreTipo] = TIPOS_META[m.tipo] || TIPOS_META.otro;
    const esGasto = m.tipo === 'apoyo' || m.tipo === 'familia';
    const proy = m.tipo === 'inversion' ? L.proyeccionInversion({ capital: e.aportado, aporteMensual: e.aporteSugerido, tasaEA: m.tasaEA || 0, anios: Math.max(1, (e.mesesRestantes || 12) / 12) }) : null;
    const promedio = Object.values(e.porMes).length ? e.gastado / Object.values(e.porMes).length : 0;
    return h`<article class="panel meta">
      <div class="panel-cabeza"><h2>${icono} ${m.nombre}</h2><span class="chip">${nombreTipo}</span></div>
      <div class="linea-pres"><div><span>${esGasto ? 'Entregado' : 'Ahorrado'}: <strong>${fmt(esGasto ? e.gastado : e.aportado)}</strong></span>
        <span class="sutil">de ${fmt(m.objetivo)}${m.fecha ? ` · ${m.fecha}` : ''}</span></div>${barraProgreso(e.avance)}</div>
      ${esGasto
        ? h`<p class="sutil">Promedio mensual: ${fmt(promedio)}. ${e.falta ? `Faltan ${fmt(e.falta)} para el tope del período.` : 'Tope del período alcanzado.'}</p>`
        : h`<p>${e.falta ? h`Para llegar a tiempo aparta <strong>${fmt(e.aporteSugerido)}</strong> al mes${e.mesesRestantes ? ` durante ${e.mesesRestantes} meses` : ''}.` : h`<span class="pos">¡Meta cumplida!</span>`}</p>`}
      ${e.partes.length ? h`<table class="tabla"><tbody>${e.partes.map((p) => h`<tr><td>${p.nombre}</td><td class="num">${fmt(p.gastado)} / ${fmt(p.monto)}</td><td style="width:35%">${barraProgreso(p.monto ? p.gastado / p.monto : 0)}</td></tr>`)}</tbody></table>
        <p class="sutil">Asigna los gastos del viaje a esta meta y escribe en etiquetas <code>parte:tiquetes</code>, <code>parte:hospedaje</code>…</p>` : ''}
      ${proy ? h`<p class="sutil">Simulación al ${((m.tasaEA || 0) * 100).toFixed(1)} % E.A.: con ${fmt(e.aporteSugerido)}/mes llegarías a <strong>${fmt(proy.final)}</strong> (${fmt(proy.rendimiento)} de rendimientos).</p>` : ''}
      <form class="formulario fila" data-aportar="${m.id}">
        ${esGasto
          ? h`<input name="monto" inputmode="decimal" placeholder="Valor entregado" required aria-label="Valor"><button class="btn-sec">Registrar entrega</button>`
          : h`<input name="monto" inputmode="decimal" placeholder="Valor a apartar" required aria-label="Valor"><button class="btn-sec">Apartar</button>`}
        <button type="button" class="icono" data-borrar-meta="${m.id}" aria-label="Borrar meta">🗑</button>
      </form></article>`;
  });
  return h`${estado.metas.length ? h`<div class="dos-columnas">${tarjetas}</div>`
      : h`<div class="vacio"><h2>Planea lo que importa</h2><p>Vacaciones, inversiones, el apoyo a tu mamá y el fondo de emergencia de la familia.</p>
        <button class="btn" data-metas-sugeridas>Crear metas sugeridas</button></div>`}
    <form id="f-meta" class="panel formulario"><h2>Nueva meta</h2><div class="campos">
      <label>Nombre<input name="nombre" required placeholder="Viaje a Cartagena"></label>
      <label>Tipo<select name="tipo">${Object.entries(TIPOS_META).map(([k, [i, n]]) => h`<option value="${k}">${i} ${n}</option>`)}</select></label>
      <label>Valor objetivo<input name="objetivo" inputmode="decimal" required placeholder="8.000.000"></label>
      <label>Fecha límite<input type="date" name="fecha"></label>
      <label>Tasa E.A. (inversión)<input name="tasa" inputmode="decimal" placeholder="10"></label>
      <label class="ancho">Partes del presupuesto (una por línea)<textarea name="partes" rows="3" placeholder="tiquetes: 3.000.000&#10;hospedaje: 2.500.000"></textarea></label>
    </div><div class="acciones"><button class="btn">Crear meta</button></div></form>`;
}

export function asientoAporte(meta, monto, fecha) {
  const etiquetas = [`meta:${meta.id}`];
  if (meta.tipo === 'apoyo' || meta.tipo === 'familia') {
    return { ...L.movimientoAAsiento({ tipo: 'gasto', fecha, monto, origen: 'banco', destino: meta.cuentaGasto || 'apoyo_mama', descripcion: meta.nombre, tercero: meta.tipo === 'apoyo' ? 'Mamá' : '' }), etiquetas };
  }
  const destino = meta.tipo === 'inversion' ? 'inversiones' : 'ahorro_metas';
  return { ...L.movimientoAAsiento({ tipo: 'transferencia', fecha, monto, origen: 'banco', destino, descripcion: `Aporte: ${meta.nombre}` }), etiquetas };
}

export function partesDesdeTexto(texto) {
  return String(texto || '').split('\n').map((l) => l.split(':')).filter((p) => p.length >= 2 && p[0].trim())
    .map(([n, ...v]) => ({ nombre: n.trim().toLowerCase(), monto: L.aCentavos(v.join(':')) })).filter((p) => p.monto > 0);
}

// ---------- Contador ----------
export const DOCUMENTOS = [
  'Certificado de ingresos y retenciones (formulario 220) del empleador',
  'Certificados de retención en la fuente de cada cliente de consultoría',
  'Extractos y certificados bancarios a 31 de diciembre (saldos e intereses)',
  'Certificado de aportes a pensión voluntaria y AFC',
  'Certificado de intereses de crédito de vivienda o leasing',
  'Certificado de medicina prepagada o pólizas de salud',
  'Planillas PILA de seguridad social como independiente',
  'Soportes de dependientes económicos (si aplica)',
  'Facturas de gastos profesionales deducibles',
  'Valor catastral / avalúo de inmuebles y vehículos',
];

export function vistaContador(estado, { anio, docs, preguntasGenerales }) {
  const desde = `${anio}-01-01`, hasta = `${anio}-12-31`;
  const delAnio = estado.asientos.filter((a) => a.fecha >= desde && a.fecha <= hasta);
  const r = L.resumenFiscal(estado.asientos, estado.cuentas, anio);
  const tipo = Object.fromEntries(estado.cuentas.map((c) => [c.id, c]));
  const preguntas = estado.asientos.filter((a) => a.pregunta && !a.preguntaResuelta);
  const sinSoporte = delAnio.filter((a) => !a.soporteId && a.partidas.some((p) => p.monto >= 500_000_00 && ['gasto', 'ingreso'].includes(tipo[p.cuenta]?.tipo) || (tipo[p.cuenta]?.deducible && p.monto > 0)));
  const listos = docs.length;
  const anios = [...new Set([...estado.asientos.map((a) => Number(a.fecha.slice(0, 4))), Number(hoyISO().slice(0, 4))])].sort();
  return h`<section class="panel"><div class="panel-cabeza"><h2>Paquete para el contador
      <select id="sel-anio-cont" aria-label="Año">${anios.map((a) => h`<option ${a === anio ? 'selected' : ''}>${a}</option>`)}</select></h2></div>
    <p class="sutil">Un solo archivo con el libro de movimientos clasificado, el resumen fiscal, tus preguntas y las fotos de los soportes ordenadas por fecha.</p>
    <div class="kpis">
      <div class="kpi"><span>Movimientos</span><strong>${delAnio.length}</strong></div>
      <div class="kpi"><span>Con soporte</span><strong>${delAnio.filter((a) => a.soporteId).length}</strong></div>
      <div class="kpi"><span>Retenciones a favor</span><strong class="pos">${fmt(r.retenciones)}</strong></div>
      <div class="kpi"><span>Documentos listos</span><strong>${listos} / ${DOCUMENTOS.length}</strong></div>
    </div>
    <div class="botonera"><button class="btn" data-paquete="zip">📦 Descargar paquete (ZIP)</button>
      <button class="btn-sec" data-paquete="compartir">💬 Enviar al contador por WhatsApp</button></div></section>
  <div class="dos-columnas">
    <section class="panel"><h2>Documentos para la declaración ${anio}</h2>
      ${DOCUMENTOS.map((d, i) => h`<label class="check-doc"><input type="checkbox" data-doc="${i}" ${docs.includes(i) ? 'checked' : ''}> ${d}</label>`)}</section>
    <section class="panel"><h2>Preguntas para el contador</h2>
      ${preguntas.length || preguntasGenerales.length ? h`<ul class="lista-preguntas">
        ${preguntasGenerales.map((p, i) => h`<li>${p} <button class="icono" data-resolver-general="${i}" aria-label="Marcar resuelta">✓</button></li>`)}
        ${preguntas.map((a) => h`<li>${a.pregunta} <span class="sutil">(${a.fecha} · ${a.descripcion || a.tercero} · ${fmt(a.partidas.filter((p) => p.monto > 0).reduce((t, p) => t + p.monto, 0))})</span>
          <button class="icono" data-resolver="${a.id}" aria-label="Marcar resuelta">✓</button></li>`)}</ul>` : h`<p class="sutil">Sin preguntas pendientes. Puedes agregarlas al registrar un movimiento o aquí.</p>`}
      <form id="f-pregunta" class="formulario fila"><input name="pregunta" required placeholder="¿Puedo deducir los intereses del crédito de vivienda?" aria-label="Pregunta"><button class="btn-sec">Agregar</button></form>
    </section>
  </div>
  ${sinSoporte.length ? h`<section class="panel"><h2>Movimientos importantes sin soporte (${sinSoporte.length})</h2>
    <p class="sutil">Mayores a $500.000 o marcados como deducibles. Envía la foto desde WhatsApp y asígnala, o pídele el soporte al tercero.</p>
    <table class="tabla"><tbody>${sinSoporte.slice(0, 15).map((a) => h`<tr><td class="nowrap">${a.fecha}</td><td>${a.descripcion || a.tercero || '—'}</td>
      <td class="num">${fmt(a.partidas.filter((p) => p.monto > 0).reduce((t, p) => t + p.monto, 0))}</td></tr>`)}</tbody></table></section>` : ''}`;
}

const extension = (mime) => ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf', 'image/heic': 'heic' }[mime] || 'bin');
const seguro = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
const csv = (filas) => '﻿' + filas.map((f) => f.map((v) => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(';')).join('\r\n') + '\r\n';

// Construye el ZIP para el contador. CSV con ';' y BOM para que Excel en español lo abra bien.
export async function paqueteContador(estado, anio, { docs, preguntasGenerales }) {
  const desde = `${anio}-01-01`, hasta = `${anio}-12-31`;
  const porId = Object.fromEntries(estado.cuentas.map((c) => [c.id, c]));
  const soportes = Object.fromEntries(estado.soportes.map((s) => [s.id, s]));
  const asientos = estado.asientos.filter((a) => a.fecha >= desde && a.fecha <= hasta).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const archivos = [], nombresSoporte = {};
  for (const a of asientos) {
    const s = a.soporteId && soportes[a.soporteId];
    if (!s?.archivo) continue;
    const valor = a.partidas.filter((p) => p.monto > 0).reduce((t, p) => t + p.monto, 0) / 100;
    let nombre = `soportes/${a.fecha}_${seguro(a.tercero || a.descripcion) || 'soporte'}_${Math.round(valor)}.${extension(s.mime)}`;
    while (archivos.some((f) => f.nombre === nombre)) nombre = nombre.replace(/(\.\w+)$/, '_b$1');
    nombresSoporte[a.id] = nombre.slice('soportes/'.length);
    archivos.push({ nombre, datos: new Uint8Array(await s.archivo.arrayBuffer()) });
  }
  const libro = [['Fecha', 'Comprobante', 'Código cuenta', 'Cuenta', 'Débito', 'Crédito', 'Tercero', 'Descripción', 'Soporte', 'Pregunta']];
  asientos.forEach((a, i) => a.partidas.forEach((p) => libro.push([
    a.fecha, i + 1, porId[p.cuenta]?.codigo || '', porId[p.cuenta]?.nombre || p.cuenta,
    p.monto > 0 ? (p.monto / 100).toFixed(2).replace('.', ',') : '', p.monto < 0 ? (-p.monto / 100).toFixed(2).replace('.', ',') : '',
    a.tercero || '', a.descripcion || '', nombresSoporte[a.id] || '', a.pregunta || '',
  ])));
  const r = L.resumenFiscal(estado.asientos, estado.cuentas, anio);
  const ob = L.obligacionDeclarar(r, anio);
  const num = (c) => (c / 100).toFixed(0);
  const resumen = [['Concepto', 'Valor (COP)'],
    ['Ingresos brutos', num(r.ingresosBrutos)],
    ...Object.entries(r.porGrupo).map(([g, v]) => [`  Ingresos ${g}`, num(v)]),
    ['Retenciones en la fuente a favor', num(r.retenciones)],
    ['Gastos deducibles / profesionales', num(r.deducibles)],
    ['Patrimonio bruto a 31-dic', num(r.patrimonioBruto)],
    ['Consumos con tarjeta de crédito', num(r.consumosTC)],
    ['Compras y consumos totales', num(r.compras)],
    ['Consignaciones', num(r.consignaciones)],
    ['¿Supera algún tope para declarar? (estimado)', ob.obligado == null ? 'sin UVT' : ob.obligado ? 'Sí' : 'No'],
  ];
  const preguntas = [...preguntasGenerales.map((p) => `- ${p}`),
    ...estado.asientos.filter((a) => a.pregunta && !a.preguntaResuelta).map((a) => `- ${a.pregunta} (movimiento ${a.fecha}, ${a.descripcion || a.tercero})`)];
  const pendientes = DOCUMENTOS.filter((_, i) => !docs.includes(i));
  const leeme = [`Paquete contable ${anio} — generado por Bitácora el ${hoyISO()}`, '',
    'Contenido:', '- libro_movimientos.csv: libro diario (partida doble, separador ;)', '- resumen_fiscal.csv', '- soportes/: fotos y PDF nombrados fecha_tercero_valor',
    '', 'Preguntas:', ...(preguntas.length ? preguntas : ['(ninguna)']), '', 'Documentos aún pendientes:', ...(pendientes.length ? pendientes.map((d) => `- ${d}`) : ['(ninguno)'])].join('\r\n');
  return crearZip([
    { nombre: 'LEEME.txt', datos: leeme },
    { nombre: 'libro_movimientos.csv', datos: csv(libro) },
    { nombre: 'resumen_fiscal.csv', datos: csv(resumen) },
    ...archivos,
  ]);
}

export async function enviarPaquete(zip, anio, texto) {
  const archivo = new File([zip], `contabilidad-${anio}.zip`, { type: 'application/zip' });
  if (navigator.canShare?.({ files: [archivo] })) {
    try { await navigator.share({ files: [archivo], text: texto, title: `Contabilidad ${anio}` }); return 'compartido'; }
    catch (e) { if (e.name === 'AbortError') return 'cancelado'; }
  }
  descargar(archivo.name, zip, 'application/zip');
  window.open(`https://wa.me/?text=${encodeURIComponent(`${texto}\n(Te envío el ZIP adjunto.)`)}`, '_blank', 'noopener');
  return 'descargado';
}

export const mensajeContador = (estado, anio, preguntasGenerales) => {
  const r = L.resumenFiscal(estado.asientos, estado.cuentas, anio);
  const n = preguntasGenerales.length + estado.asientos.filter((a) => a.pregunta && !a.preguntaResuelta).length;
  return `Hola, te comparto mi información contable de ${anio}: ingresos brutos ${fmt(r.ingresosBrutos)}, retenciones a favor ${fmt(r.retenciones)}, patrimonio bruto ${fmt(r.patrimonioBruto)}. ${n ? `Tengo ${n} pregunta(s) en el archivo LEEME.` : ''}`.trim();
};

