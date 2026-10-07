// Módulo Finanzas y Contabilidad: interfaz sobre el núcleo de partida doble (ledger.js).
import * as L from './ledger.js';
import * as DB from '../../core/db.js';
import { h, html, $, $$, aviso, descargar, leerArchivo, hoyISO, formularioAObjeto, graficoMensual, barraProgreso } from '../../core/ui.js';

const SECCIONES = [
  ['resumen', 'Resumen'], ['movimientos', 'Movimientos'], ['cuentas', 'Cuentas'], ['presupuesto', 'Presupuesto'],
  ['recurrentes', 'Recurrentes'], ['impuestos', 'Impuestos'], ['datos', 'Importar / Exportar'],
];

let estado = { cuentas: [], asientos: [], presupuestos: [], recurrentes: [], reglas: [], mes: hoyISO().slice(0, 7) };
const fmt = (c) => L.formatoMoneda(c);
const cuenta = (id) => estado.cuentas.find((c) => c.id === id);
const nombreCuenta = (id) => cuenta(id)?.nombre || id;

async function cargar() {
  const [cuentas, asientos, presupuestos, recurrentes, reglas] = await Promise.all(
    ['cuentas', 'asientos', 'presupuestos', 'recurrentes', 'reglas'].map((a) => DB.todos(a)));
  Object.assign(estado, { cuentas: cuentas.sort((a, b) => a.codigo.localeCompare(b.codigo)), asientos, presupuestos, recurrentes, reglas });
}

const opcionesCuenta = (tipos, seleccion) => h`${tipos.map((t) => h`<optgroup label="${L.TIPOS[t].nombre}">
  ${estado.cuentas.filter((c) => c.tipo === t && c.activa).map((c) => h`<option value="${c.id}" ${c.id === seleccion ? 'selected' : ''}>${c.codigo} · ${c.nombre}</option>`)}
  </optgroup>`)}`;

const recurrentesPendientes = () => estado.recurrentes.reduce((n, r) => n + L.fechasPendientes(r, hoyISO()).length, 0);

// ---------- Resumen ----------
function vistaResumen() {
  const { mes } = estado;
  const er = L.estadoResultados(estado.asientos, estado.cuentas, `${mes}-01`, L.finDeMes(mes));
  const bg = L.balanceGeneral(estado.asientos, estado.cuentas, L.finDeMes(mes));
  const serie = L.serieMensual(estado.asientos, estado.cuentas, mes, 12);
  const pres = L.estadoPresupuesto(estado.presupuestos, estado.asientos, estado.cuentas, mes);
  const pend = recurrentesPendientes();
  const liquidez = ['caja', 'banco'].reduce((t, id) => t + (cuenta(id) ? L.saldoNatural(cuenta(id), L.saldos(estado.asientos, { hasta: L.finDeMes(mes) })[id]) : 0), 0);
  const gastoProm = serie.slice(-6).reduce((t, d) => t + d.gastos, 0) / 6;

  if (!estado.asientos.length) return h`<div class="vacio">
    <h2>Empecemos</h2>
    <ol><li>Registra tus <strong>saldos iniciales</strong> en <a href="#/finanzas/cuentas">Cuentas</a>.</li>
    <li>Anota movimientos en <a href="#/finanzas/movimientos">Movimientos</a> o importa el extracto del banco en <a href="#/finanzas/datos">Importar</a>.</li>
    <li>Define topes de gasto en <a href="#/finanzas/presupuesto">Presupuesto</a>.</li></ol>
    <p><button class="btn" data-accion="demo">Cargar datos de ejemplo</button></p></div>`;

  return h`
    ${pend ? h`<p class="alerta-caja">Tienes ${pend} movimiento(s) recurrente(s) por registrar. <a href="#/finanzas/recurrentes">Revisar</a></p>` : ''}
    <section class="kpis">
      <div class="kpi"><span>Ingresos del mes</span><strong class="pos">${fmt(er.totalIngresos)}</strong></div>
      <div class="kpi"><span>Gastos del mes</span><strong class="neg">${fmt(er.totalGastos)}</strong></div>
      <div class="kpi"><span>Resultado</span><strong class="${er.resultado >= 0 ? 'pos' : 'neg'}">${fmt(er.resultado)}</strong>
        <small>Tasa de ahorro ${(er.tasaAhorro * 100).toFixed(1)} %</small></div>
      <div class="kpi"><span>Patrimonio neto</span><strong>${fmt(bg.patrimonioNeto)}</strong>
        <small>Colchón: ${gastoProm ? (liquidez / gastoProm).toFixed(1) : '—'} meses de gasto</small></div>
    </section>
    <section class="panel"><div class="panel-cabeza"><h2>Últimos 12 meses</h2>
      <span class="leyenda"><i class="g-ing"></i>Ingresos <i class="g-gas"></i>Gastos</span></div>
      ${graficoMensual(serie, fmt)}</section>
    <div class="dos-columnas">
      <section class="panel"><h2>¿En qué se fue el dinero?</h2>
        ${er.gastos.length ? h`<table class="tabla"><tbody>${er.gastos.slice(0, 8).map((g) => h`<tr><td>${g.cuenta.nombre}</td>
          <td class="num">${fmt(g.valor)}</td><td class="num sutil">${er.totalGastos ? ((g.valor / er.totalGastos) * 100).toFixed(0) : 0} %</td></tr>`)}</tbody></table>`
        : h`<p class="sutil">Sin gastos este mes.</p>`}</section>
      <section class="panel"><h2>Presupuesto</h2>
        ${pres.length ? pres.slice(0, 6).map((p) => h`<div class="linea-pres"><div><span>${p.cuenta.nombre}</span>
          <span class="sutil">${fmt(p.gastado)} / ${fmt(p.presupuesto)}</span></div>${barraProgreso(p.uso)}</div>`)
        : h`<p class="sutil">Aún no defines presupuesto. <a href="#/finanzas/presupuesto">Crear</a></p>`}</section>
    </div>`;
}

// ---------- Movimientos ----------
function formularioMovimiento(editar) {
  const a = editar || {};
  const tipo = a.tipo || 'gasto';
  const bruto = a.tipo === 'honorarios' ? a.partidas.find((p) => p.cuenta === 'honorarios') : a.partidas?.[0];
  const monto = bruto ? Math.abs(bruto.monto) / 100 : '';
  const ret = a.tipo === 'honorarios' ? a.partidas.find((p) => p.cuenta === 'ret_favor') : null;
  const tasa = ret && bruto ? (ret.monto / Math.abs(bruto.monto)).toFixed(2) : '0.10';
  return h`<form id="f-mov" class="panel formulario" autocomplete="off">
    <input type="hidden" name="id" value="${a.id || ''}">
    <div class="segmentado" role="radiogroup" aria-label="Tipo de movimiento">
      ${[['gasto', 'Gasto'], ['ingreso', 'Ingreso'], ['transferencia', 'Transferencia'], ['honorarios', 'Honorarios']].map(([v, t]) =>
        h`<label><input type="radio" name="tipo" value="${v}" ${tipo === v ? 'checked' : ''}><span>${t}</span></label>`)}
    </div>
    <div class="campos">
      <label>Fecha<input type="date" name="fecha" required value="${a.fecha || hoyISO()}"></label>
      <label>Valor (COP)<input name="monto" inputmode="decimal" required placeholder="50.000" value="${monto}"></label>
      <label class="ancho">Descripción<input name="descripcion" placeholder="Mercado semanal" value="${a.descripcion || ''}"></label>
      <label>Tercero / cliente<input name="tercero" list="terceros" value="${a.tercero || ''}"></label>
      <label data-solo="gasto transferencia ingreso" id="l-origen">Desde<select name="origen"></select></label>
      <label id="l-destino">Hacia<select name="destino"></select></label>
      <label data-solo="honorarios">Retención en la fuente
        <select name="retencion">${[['0.10', '10 % (tarifa general honorarios)'], ['0.11', '11 % (contratos > 3.300 UVT en el año)'], ['0.00', 'Sin retención']].map(([v, t]) =>
          h`<option value="${v}" ${v === tasa ? 'selected' : ''}>${t}</option>`)}</select></label>
      <label data-solo="honorarios">Proyecto<input name="proyecto" placeholder="Estudio de demanda"></label>
      <label class="ancho">Etiquetas<input name="etiquetas" placeholder="familia, viaje-2026" value="${(a.etiquetas || []).filter((e) => e !== 'importado').join(', ')}"></label>
    </div>
    <datalist id="terceros">${[...new Set(estado.asientos.map((x) => x.tercero).filter(Boolean))].map((t) => h`<option value="${t}">`)}</datalist>
    <div class="acciones"><button class="btn">${a.id ? 'Guardar cambios' : 'Registrar'}</button>
      ${a.id ? h`<a class="btn-sec" href="#/finanzas/movimientos">Cancelar</a>` : ''}</div>
  </form>`;
}

function ajustarFormulario(form, editar) {
  const tipo = form.tipo.value;
  const conf = {
    gasto: [['activo', 'pasivo'], ['gasto'], 'banco', 'alimentacion'],
    ingreso: [['ingreso'], ['activo'], 'salario', 'banco'],
    transferencia: [['activo', 'pasivo'], ['activo', 'pasivo'], 'banco', 'caja'],
    honorarios: [[], ['activo'], null, 'banco'],
  }[tipo];
  const sale = editar?.partidas.find((p) => p.monto < 0), entra = editar?.partidas.find((p) => p.monto > 0 && p.cuenta !== 'ret_favor');
  const [p0, p1] = editar && editar.tipo === tipo ? [sale?.cuenta, entra?.cuenta] : [conf[2], conf[3]];
  form.origen.innerHTML = opcionesCuenta(conf[0], p0).html;
  form.destino.innerHTML = opcionesCuenta(conf[1], p1).html;
  $$('[data-solo]', form).forEach((el) => { el.hidden = !el.dataset.solo.split(' ').includes(tipo); });
  $('#l-destino', form).firstChild.textContent = tipo === 'gasto' ? 'Categoría' : tipo === 'honorarios' ? 'Cuenta donde recibes' : 'Hacia';
  $('#l-origen', form).firstChild.textContent = tipo === 'ingreso' ? 'Fuente de ingreso' : 'Desde';
}

const editable = (a) => a.tipo === 'honorarios' || (['gasto', 'ingreso', 'transferencia'].includes(a.tipo) && a.partidas.length === 2);

function listaMovimientos(filtro) {
  const txt = (filtro.q || '').toLowerCase();
  const lista = estado.asientos
    .filter((a) => (!filtro.mes || a.fecha.startsWith(filtro.mes)))
    .filter((a) => !filtro.cuenta || a.partidas.some((p) => p.cuenta === filtro.cuenta))
    .filter((a) => !txt || `${a.descripcion} ${a.tercero} ${(a.etiquetas || []).join(' ')}`.toLowerCase().includes(txt))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.actualizado || '').localeCompare(a.actualizado || ''));
  if (!lista.length) return h`<p class="sutil">No hay movimientos con ese filtro.</p>`;
  return h`<table class="tabla movs"><thead><tr><th>Fecha</th><th>Descripción</th><th>Cuentas</th><th class="num">Valor</th><th></th></tr></thead><tbody>
    ${lista.slice(0, 300).map((a) => {
      const debe = a.partidas.filter((p) => p.monto > 0), haber = a.partidas.filter((p) => p.monto < 0);
      const total = debe.reduce((t, p) => t + p.monto, 0);
      const esGasto = debe.some((p) => cuenta(p.cuenta)?.tipo === 'gasto');
      const esIngreso = haber.some((p) => cuenta(p.cuenta)?.tipo === 'ingreso');
      return h`<tr><td class="nowrap">${a.fecha}</td>
        <td>${a.descripcion || '—'}${a.tercero ? h` <span class="sutil">· ${a.tercero}</span>` : ''}
          ${(a.etiquetas || []).map((e) => h` <span class="chip">${e}</span>`)}</td>
        <td class="sutil">${haber.map((p) => nombreCuenta(p.cuenta)).join(' + ')} → ${debe.map((p) => nombreCuenta(p.cuenta)).join(' + ')}</td>
        <td class="num ${esGasto ? 'neg' : esIngreso ? 'pos' : ''}">${fmt(total)}</td>
        <td class="nowrap">${editable(a) ? h`<button class="icono" data-editar="${a.id}" aria-label="Editar">✎</button>` : ''}
          <button class="icono" data-borrar="${a.id}" aria-label="Borrar">🗑</button></td></tr>`;
    })}</tbody></table>${lista.length > 300 ? h`<p class="sutil">Mostrando 300 de ${lista.length}. Usa los filtros.</p>` : ''}`;
}

function vistaMovimientos(editarId) {
  const hallado = editarId ? estado.asientos.find((a) => a.id === editarId) : null;
  const editar = hallado && editable(hallado) ? hallado : null;
  return h`${formularioMovimiento(editar)}
    <section class="panel"><div class="filtros">
      <input type="month" id="fil-mes" value="${estado.mes}" aria-label="Mes">
      <select id="fil-cuenta" aria-label="Cuenta"><option value="">Todas las cuentas</option>${opcionesCuenta(Object.keys(L.TIPOS))}</select>
      <input type="search" id="fil-q" placeholder="Buscar descripción, tercero, etiqueta" aria-label="Buscar"></div>
      <div id="lista-movs">${listaMovimientos({ mes: estado.mes })}</div></section>`;
}

async function guardarMovimiento(form) {
  const d = formularioAObjeto(form);
  const monto = L.aCentavos(d.monto);
  if (!(monto > 0)) return aviso('Escribe un valor mayor que cero.', 'mal');
  const etiquetas = d.etiquetas.split(',').map((x) => x.trim()).filter(Boolean);
  let asiento;
  if (d.tipo === 'honorarios') {
    asiento = L.honorariosAAsiento({ fecha: d.fecha, bruto: monto, tasaRetencion: Number(d.retencion), destino: d.destino, cliente: d.tercero, descripcion: d.descripcion, proyecto: d.proyecto });
    asiento.etiquetas.push(...etiquetas);
  } else {
    if (d.origen === d.destino) return aviso('Origen y destino no pueden ser la misma cuenta.', 'mal');
    asiento = L.movimientoAAsiento({ ...d, monto, etiquetas });
  }
  const errores = L.validarAsiento(asiento);
  if (errores.length) return aviso(errores[0], 'mal');
  await DB.guardar('asientos', { ...asiento, id: d.id || undefined });
  aviso(d.id ? 'Movimiento actualizado' : 'Movimiento registrado');
  return true;
}

// ---------- Cuentas ----------
function vistaCuentas() {
  const s = L.saldos(estado.asientos);
  return h`<section class="panel"><h2>Plan de cuentas</h2>
    <p class="sutil">Partida doble: cada peso sale de una cuenta y llega a otra. Códigos de referencia del PUC colombiano.</p>
    ${Object.entries(L.TIPOS).map(([t, info]) => h`<h3>${info.nombre}</h3><table class="tabla"><tbody>
      ${estado.cuentas.filter((c) => c.tipo === t).map((c) => h`<tr class="${c.activa ? '' : 'apagado'}"><td class="sutil">${c.codigo}</td>
        <td>${c.nombre}${c.deducible ? h` <span class="chip">deducible</span>` : ''}</td>
        <td class="num">${fmt(L.saldoNatural(c, s[c.id]))}</td>
        <td class="nowrap"><button class="icono" data-alternar="${c.id}" aria-label="${c.activa ? 'Archivar' : 'Reactivar'}">${c.activa ? '⏸' : '▶'}</button></td></tr>`)}
      </tbody></table>`)}</section>
    <div class="dos-columnas">
      <form id="f-saldo" class="panel formulario"><h2>Saldo inicial</h2>
        <p class="sutil">Lo que tienes (o debes) hoy en cada cuenta. Se registra contra "Patrimonio inicial".</p>
        <div class="campos"><label>Cuenta<select name="cuenta">${opcionesCuenta(['activo', 'pasivo'], 'banco')}</select></label>
        <label>Saldo<input name="monto" inputmode="decimal" required placeholder="2.500.000"></label>
        <label>Fecha<input type="date" name="fecha" value="${hoyISO()}" required></label></div>
        <div class="acciones"><button class="btn">Registrar saldo</button></div></form>
      <form id="f-cuenta" class="panel formulario"><h2>Nueva cuenta</h2>
        <div class="campos"><label>Nombre<input name="nombre" required placeholder="Nequi, Fondo de pensiones voluntarias…"></label>
        <label>Tipo<select name="tipo">${Object.entries(L.TIPOS).map(([t, i]) => h`<option value="${t}">${i.nombre}</option>`)}</select></label>
        <label>Código<input name="codigo" placeholder="1115"></label>
        <label class="check"><input type="checkbox" name="deducible"> Gasto deducible / profesional</label></div>
        <div class="acciones"><button class="btn">Crear cuenta</button></div></form>
    </div>`;
}

// ---------- Presupuesto ----------
function vistaPresupuesto() {
  const pres = L.estadoPresupuesto(estado.presupuestos, estado.asientos, estado.cuentas, estado.mes);
  const total = pres.reduce((t, p) => t + p.presupuesto, 0), gastado = pres.reduce((t, p) => t + p.gastado, 0);
  return h`<section class="panel"><div class="panel-cabeza"><h2>Presupuesto de ${estado.mes}</h2>
      <span class="sutil">${fmt(gastado)} de ${fmt(total)}</span></div>
    ${pres.length ? pres.map((p) => h`<div class="linea-pres"><div><span>${p.cuenta.nombre}</span>
      <span class="${p.disponible < 0 ? 'neg' : 'sutil'}">${p.disponible < 0 ? 'Excedido en ' + fmt(-p.disponible) : 'Quedan ' + fmt(p.disponible)}</span></div>
      ${barraProgreso(p.uso)}</div>`) : h`<p class="sutil">Sin presupuesto. Asigna un tope a cada categoría de gasto.</p>`}</section>
    <form id="f-pres" class="panel formulario"><h2>Asignar tope</h2>
      <div class="campos"><label>Categoría<select name="cuenta">${opcionesCuenta(['gasto'])}</select></label>
      <label>Tope mensual<input name="monto" inputmode="decimal" required placeholder="1.200.000"></label>
      <label>Aplica a<select name="mes"><option value="*">Todos los meses</option><option value="${estado.mes}">Solo ${estado.mes}</option></select></label></div>
      <div class="acciones"><button class="btn">Guardar</button></div>
      <p class="sutil">Consejo: la regla 50/30/20 (necesidades/deseos/ahorro) es un buen punto de partida.</p></form>`;
}

// ---------- Recurrentes ----------
function vistaRecurrentes() {
  const hoy = hoyISO();
  return h`<section class="panel"><h2>Movimientos recurrentes</h2>
    <p class="sutil">Salario, arriendo, servicios, cuotas, suscripciones. Se proponen al llegar la fecha; tú confirmas.</p>
    ${estado.recurrentes.length ? h`<table class="tabla"><thead><tr><th>Descripción</th><th>Frecuencia</th><th class="num">Valor</th><th>Pendientes</th><th></th></tr></thead><tbody>
      ${estado.recurrentes.map((r) => { const p = L.fechasPendientes(r, hoy); return h`<tr><td>${r.plantilla.descripcion}</td><td>${r.frecuencia}</td>
        <td class="num">${fmt(r.plantilla.monto)}</td><td>${p.length ? h`<button class="btn-sec" data-generar="${r.id}">Registrar ${p.length}</button>` : h`<span class="sutil">al día</span>`}</td>
        <td><button class="icono" data-borrar-rec="${r.id}" aria-label="Borrar">🗑</button></td></tr>`; })}</tbody></table>` : h`<p class="sutil">Aún no hay recurrentes.</p>`}</section>
    <form id="f-rec" class="panel formulario"><h2>Nuevo recurrente</h2>
      <div class="campos"><label>Tipo<select name="tipo"><option value="gasto">Gasto</option><option value="ingreso">Ingreso</option><option value="transferencia">Transferencia</option></select></label>
      <label class="ancho">Descripción<input name="descripcion" required placeholder="Arriendo apartamento"></label>
      <label>Valor<input name="monto" inputmode="decimal" required></label>
      <label>Frecuencia<select name="frecuencia"><option>mensual</option><option>quincenal</option><option>semanal</option><option>anual</option></select></label>
      <label>Primera fecha<input type="date" name="inicio" value="${hoy}" required></label>
      <label>Desde<select name="origen">${opcionesCuenta(['activo', 'pasivo', 'ingreso'], 'banco')}</select></label>
      <label>Hacia<select name="destino">${opcionesCuenta(['gasto', 'activo', 'pasivo'], 'vivienda')}</select></label></div>
      <div class="acciones"><button class="btn">Crear</button></div></form>`;
}

// ---------- Impuestos ----------
function vistaImpuestos(anio) {
  const r = L.resumenFiscal(estado.asientos, estado.cuentas, anio);
  const ob = L.obligacionDeclarar(r, anio);
  const anios = [...new Set([...estado.asientos.map((a) => Number(a.fecha.slice(0, 4))), Number(hoyISO().slice(0, 4))])].sort();
  return h`<section class="panel"><div class="panel-cabeza"><h2>Renta persona natural — año gravable
      <select id="sel-anio">${anios.map((a) => h`<option ${a === anio ? 'selected' : ''}>${a}</option>`)}</select></h2>
      ${ob.uvt ? h`<span class="chip">UVT ${anio}: ${L.formatoMoneda(ob.uvt * 100)}</span>` : ''}</div>
    ${ob.uvt ? h`<p class="${ob.obligado ? 'alerta-caja' : 'ok-caja'}">${ob.obligado
      ? `Según tus registros, estarías obligado a declarar renta por el año ${anio} (se presenta en ${anio + 1}).`
      : `Con lo registrado hasta hoy no superas los topes de ${anio}. Revísalo de nuevo al cierre del año.`}</p>
      ${ob.criterios.map((c) => h`<div class="linea-pres"><div><span>${c.nombre}</span>
        <span class="sutil">${fmt(c.valor)} / tope ${fmt(c.tope)}</span></div>${barraProgreso(c.uso)}</div>`)}`
    : h`<p class="sutil">No tengo la UVT de ${anio}. Actualiza ledger.js (constante UVT).</p>`}
    </section>
    <div class="dos-columnas">
      <section class="panel"><h2>Ingresos por cédula/origen</h2><table class="tabla"><tbody>
        ${Object.entries(r.porGrupo).map(([g, v]) => h`<tr><td>${{ laboral: 'Rentas de trabajo (salario)', consultoria: 'Honorarios (trabajo no laboral)' }[g] || 'Otros'}</td><td class="num">${fmt(v)}</td></tr>`)}
        <tr><td><strong>Total ingresos brutos</strong></td><td class="num"><strong>${fmt(r.ingresosBrutos)}</strong></td></tr></tbody></table></section>
      <section class="panel"><h2>Para tu declaración</h2><table class="tabla"><tbody>
        <tr><td>Retenciones en la fuente que te practicaron</td><td class="num pos">${fmt(r.retenciones)}</td></tr>
        <tr><td>Gastos marcados como deducibles/profesionales</td><td class="num">${fmt(r.deducibles)}</td></tr>
        <tr><td>Patrimonio bruto (activos a 31-dic)</td><td class="num">${fmt(r.patrimonioBruto)}</td></tr>
        <tr><td>Consumos con tarjeta de crédito</td><td class="num">${fmt(r.consumosTC)}</td></tr></tbody></table>
        <p class="sutil">Las retenciones se restan del impuesto a cargo. Guarda los certificados (formulario 220 y certificados de retención de cada cliente).</p></section>
    </div>
    <p class="sutil nota">Estimación informativa basada en tus registros y en los topes del E.T. (arts. 592–594-3). No reemplaza la asesoría de un contador.</p>`;
}

// ---------- Datos ----------
function vistaDatos() {
  return h`<div class="dos-columnas">
    <section class="panel"><h2>Importar extracto bancario (CSV)</h2>
      <p class="sutil">Descarga el extracto desde tu banca en línea (CSV o Excel guardado como CSV). Valores negativos = salidas.</p>
      <input type="file" id="arch-csv" accept=".csv,.txt">
      <div id="mapeo"></div></section>
    <section class="panel"><h2>Reglas de categorización</h2>
      <p class="sutil">Si la descripción contiene el texto, se asigna la categoría. Se aplican al importar.</p>
      <table class="tabla"><tbody>${estado.reglas.map((r) => h`<tr><td>"${r.contiene}"</td><td>→ ${nombreCuenta(r.cuenta)}</td>
        <td><button class="icono" data-borrar-regla="${r.id}" aria-label="Borrar">🗑</button></td></tr>`)}</tbody></table>
      <form id="f-regla" class="formulario"><div class="campos"><label>Contiene<input name="contiene" required placeholder="EXITO"></label>
        <label>Categoría<select name="cuenta">${opcionesCuenta(['gasto', 'ingreso'])}</select></label></div>
        <div class="acciones"><button class="btn-sec">Agregar regla</button></div></form></section>
  </div>
  <section class="panel"><h2>Exportar y respaldar</h2>
    <div class="botonera">
      <button class="btn" data-exportar="json">Respaldo completo (JSON)</button>
      <button class="btn-sec" data-exportar="tidy">CSV tidy para R / Python</button>
      <button class="btn-sec" data-exportar="hledger">Diario hledger / ledger</button>
      <label class="btn-sec archivo">Restaurar respaldo<input type="file" id="arch-json" accept=".json" hidden></label>
    </div>
    <p class="sutil">El CSV tidy tiene una fila por partida; en R: <code>source("r/leer_bitacora.R")</code> y <code>bitacora_resumen(leer_bitacora("bitacora.csv"))</code>.</p>
    <details><summary>Zona de peligro</summary><button class="btn-peligro" data-accion="reiniciar">Borrar todos los datos financieros</button></details>
  </section>`;
}

function mapeoCSV(filas) {
  const cab = filas[0] || [];
  const adivina = (re) => Math.max(0, cab.findIndex((c) => re.test(c)));
  const sel = (nombre, idx) => h`<select name="${nombre}">${cab.map((c, i) => h`<option value="${i}" ${i === idx ? 'selected' : ''}>${c || `Columna ${i + 1}`}</option>`)}</select>`;
  return h`<form id="f-import" class="formulario"><div class="campos">
    <label>Fecha${sel('colFecha', adivina(/fecha|date/i))}</label>
    <label>Descripción${sel('colDescripcion', adivina(/desc|concepto|detalle/i))}</label>
    <label>Valor${sel('colMonto', adivina(/valor|monto|importe|amount/i))}</label>
    <label>Cuenta del extracto<select name="cuentaBanco">${opcionesCuenta(['activo', 'pasivo'], 'banco')}</select></label>
    <label class="check"><input type="checkbox" name="invertir"> Invertir signos (tarjetas de crédito)</label></div>
    <p class="sutil">${filas.length - 1} filas detectadas. Vista previa: ${filas.slice(1, 3).map((f) => f.join(' | ')).join(' ⏎ ')}</p>
    <div class="acciones"><button class="btn">Importar</button></div></form>`;
}

// ---------- Datos de ejemplo ----------
async function cargarDemo() {
  const hoy = hoyISO(), meses = L.mesesHasta(hoy.slice(0, 7), 6);
  const A = [{ fecha: `${meses[0]}-01`, descripcion: 'Saldo inicial', tipo: 'apertura', etiquetas: ['demo'], partidas: [{ cuenta: 'banco', monto: 6_500_000_00 }, { cuenta: 'patrimonio', monto: -6_500_000_00 }] }];
  const mov = (tipo, dia, mes, monto, origen, destino, descripcion, tercero = '') => {
    const fecha = `${mes}-${String(dia).padStart(2, '0')}`;
    if (fecha <= hoy) A.push({ ...L.movimientoAAsiento({ tipo, fecha, monto, origen, destino, descripcion, tercero }), etiquetas: ['demo'] });
  };
  meses.forEach((m, i) => {
    mov('ingreso', 5, m, 6_800_000_00, 'salario', 'banco', 'Nómina docente', 'Universidad');
    mov('gasto', 5, m, 1_900_000_00, 'banco', 'vivienda', 'Arriendo y administración');
    mov('gasto', 12, m, 240_000_00 + i * 9_000_00, 'banco', 'vivienda', 'Servicios públicos', 'EPM');
    mov('gasto', 8, m, 1_150_000_00 + (i % 3) * 120_000_00, 'tc', 'alimentacion', 'Mercado', 'Supermercado');
    mov('gasto', 15, m, 380_000_00, 'banco', 'transporte', 'Gasolina y parqueaderos');
    mov('gasto', 10, m, 650_000_00, 'banco', 'educacion', 'Colegio', 'Colegio');
    mov('gasto', 20, m, 210_000_00 + (i % 2) * 180_000_00, 'tc', 'ocio', 'Salidas en familia');
    mov('gasto', 3, m, 95_000_00, 'tc', 'trabajo', 'Suscripciones software (RStudio, Overleaf)');
    mov('transferencia', 22, m, 1_000_000_00, 'banco', 'tc', 'Pago tarjeta de crédito');
    if (i % 2 === 1) {
      const fecha = `${m}-18`;
      if (fecha <= hoy) A.push({ ...L.honorariosAAsiento({ fecha, bruto: 4_500_000_00, tasaRetencion: 0.11, cliente: 'Secretaría de Planeación', proyecto: 'Modelo de pronóstico' }), etiquetas: ['demo', 'proyecto:pronostico'] });
    }
  });
  await DB.guardarVarios('asientos', A);
  await DB.guardarVarios('presupuestos', [
    { mes: '*', cuenta: 'alimentacion', monto: 1_300_000_00 }, { mes: '*', cuenta: 'ocio', monto: 300_000_00 },
    { mes: '*', cuenta: 'transporte', monto: 450_000_00 }, { mes: '*', cuenta: 'vivienda', monto: 2_200_000_00 },
  ]);
  aviso('Datos de ejemplo cargados');
}

// ---------- Montaje y eventos ----------
async function montar(el, seccion = 'resumen') {
  await cargar();
  const [sec, extra] = (seccion || 'resumen').split(':');
  const anio = Number(extra) || Number(estado.mes.slice(0, 4));
  const vistas = {
    resumen: vistaResumen, movimientos: () => vistaMovimientos(extra), cuentas: vistaCuentas, presupuesto: vistaPresupuesto,
    recurrentes: vistaRecurrentes, impuestos: () => vistaImpuestos(anio), datos: vistaDatos,
  };
  const vista = vistas[sec] || vistas.resumen;
  const conMes = ['resumen', 'presupuesto'].includes(sec);
  el.innerHTML = html`<header class="cabecera"><div><h1>💰 Finanzas y contabilidad</h1>
      <p class="sutil">Partida doble, presupuesto, honorarios y renta — en pesos colombianos.</p></div>
      ${conMes ? h`<input type="month" id="sel-mes" value="${estado.mes}" aria-label="Mes de análisis">` : ''}</header>
    <nav class="pestanas" aria-label="Secciones de finanzas">${SECCIONES.map(([id, t]) =>
      h`<a href="#/finanzas/${id}" class="${id === sec ? 'activo' : ''}" ${id === sec ? 'aria-current="page"' : ''}>${t}${id === 'recurrentes' && recurrentesPendientes() ? h` <span class="punto"></span>` : ''}</a>`)}</nav>
    <div id="vista">${vista()}</div>`;
  conectar(el, sec, () => montar(el, seccion));
}

function conectar(el, sec, refrescar) {
  $('#sel-mes', el)?.addEventListener('change', (e) => { estado.mes = e.target.value || estado.mes; refrescar(); });
  $('#sel-anio', el)?.addEventListener('change', (e) => { location.hash = `#/finanzas/impuestos:${e.target.value}`; });

  const fMov = $('#f-mov', el);
  if (fMov) {
    const editar = estado.asientos.find((a) => a.id === fMov.id.value);
    ajustarFormulario(fMov, editar);
    $$('[name=tipo]', fMov).forEach((r) => r.addEventListener('change', () => ajustarFormulario(fMov)));
    fMov.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (await guardarMovimiento(fMov)) {
        if (fMov.id.value) location.hash = '#/finanzas/movimientos'; else refrescar();
      }
    });
    const filtrar = () => {
      $('#lista-movs', el).innerHTML = html`${listaMovimientos({ mes: $('#fil-mes', el).value, cuenta: $('#fil-cuenta', el).value, q: $('#fil-q', el).value })}`;
    };
    ['#fil-mes', '#fil-cuenta', '#fil-q'].forEach((s) => $(s, el).addEventListener('input', filtrar));
  }

  el.onclick = async (e) => {
    const b = e.target.closest('button, [data-accion]');
    if (!b) return;
    const d = b.dataset;
    if (d.editar) location.hash = `#/finanzas/movimientos:${d.editar}`;
    else if (d.borrar && confirm('¿Borrar este movimiento?')) { await DB.borrar('asientos', d.borrar); aviso('Borrado'); refrescar(); }
    else if (d.alternar) { const c = cuenta(d.alternar); await DB.guardar('cuentas', { ...c, activa: !c.activa }); refrescar(); }
    else if (d.borrarRec) { await DB.borrar('recurrentes', d.borrarRec); refrescar(); }
    else if (d.borrarRegla) { await DB.borrar('reglas', d.borrarRegla); refrescar(); }
    else if (d.generar) {
      const r = estado.recurrentes.find((x) => x.id === d.generar);
      const fechas = L.fechasPendientes(r, hoyISO());
      await DB.guardarVarios('asientos', fechas.map((fecha) => ({ ...L.movimientoAAsiento({ ...r.plantilla, fecha }), etiquetas: ['recurrente'] })));
      await DB.guardar('recurrentes', { ...r, ultima: fechas.at(-1) });
      aviso(`${fechas.length} movimiento(s) registrados`); refrescar();
    } else if (d.exportar) await exportar(d.exportar);
    else if (d.accion === 'demo') { await cargarDemo(); refrescar(); }
    else if (d.accion === 'reiniciar' && confirm('Esto borra movimientos, presupuestos, recurrentes y reglas. ¿Seguro? (Haz un respaldo antes)')) {
      for (const a of ['asientos', 'presupuestos', 'recurrentes', 'reglas']) await DB.vaciar(a);
      aviso('Datos borrados'); refrescar();
    }
  };

  $('#f-saldo', el)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formularioAObjeto(e.target), monto = L.aCentavos(d.monto), c = cuenta(d.cuenta);
    if (!monto) return aviso('Valor inválido', 'mal');
    const firmado = c.tipo === 'pasivo' ? -Math.abs(monto) : monto;
    await DB.guardar('asientos', { fecha: d.fecha, descripcion: `Saldo inicial ${c.nombre}`, tipo: 'apertura', etiquetas: [],
      partidas: [{ cuenta: c.id, monto: firmado }, { cuenta: 'patrimonio', monto: -firmado }] });
    aviso('Saldo registrado'); refrescar();
  });
  $('#f-cuenta', el)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formularioAObjeto(e.target);
    const base = { activo: '1', pasivo: '2', patrimonio: '3', ingreso: '4', gasto: '5' }[d.tipo];
    await DB.guardar('cuentas', { nombre: d.nombre.trim(), tipo: d.tipo, codigo: d.codigo || `${base}9${String(estado.cuentas.length).padStart(2, '0')}`, activa: true, deducible: !!d.deducible });
    aviso('Cuenta creada'); refrescar();
  });
  $('#f-pres', el)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formularioAObjeto(e.target);
    const previo = estado.presupuestos.find((p) => p.cuenta === d.cuenta && p.mes === d.mes);
    await DB.guardar('presupuestos', { id: previo?.id, cuenta: d.cuenta, mes: d.mes, monto: L.aCentavos(d.monto) });
    aviso('Presupuesto guardado'); refrescar();
  });
  $('#f-rec', el)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formularioAObjeto(e.target);
    await DB.guardar('recurrentes', { frecuencia: d.frecuencia, inicio: d.inicio,
      plantilla: { tipo: d.tipo, monto: L.aCentavos(d.monto), origen: d.origen, destino: d.destino, descripcion: d.descripcion } });
    aviso('Recurrente creado'); refrescar();
  });
  $('#f-regla', el)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await DB.guardar('reglas', formularioAObjeto(e.target)); refrescar();
  });

  $('#arch-csv', el)?.addEventListener('change', async (e) => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    const filas = L.parseCSV(await leerArchivo(archivo));
    $('#mapeo', el).innerHTML = mapeoCSV(filas).html;
    $('#f-import', el).addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const d = formularioAObjeto(ev.target);
      const datos = d.invertir ? filas.map((f, i) => (i === 0 ? f : f.map((v, j) => (j === Number(d.colMonto) ? String(-L.aCentavos(v) / 100) : v)))) : filas;
      const { asientos, errores } = L.extractoAAsientos(datos, { colFecha: +d.colFecha, colDescripcion: +d.colDescripcion, colMonto: +d.colMonto, cuentaBanco: d.cuentaBanco, reglas: estado.reglas });
      await DB.guardarVarios('asientos', asientos);
      aviso(`${asientos.length} movimientos importados${errores.length ? `; ${errores.length} filas omitidas` : ''}`);
      location.hash = '#/finanzas/movimientos';
    });
  });
  $('#arch-json', el)?.addEventListener('change', async (e) => {
    const archivo = e.target.files[0];
    if (!archivo || !confirm('Restaurar reemplaza TODOS los datos actuales. ¿Continuar?')) return;
    try { await DB.restaurar(JSON.parse(await leerArchivo(archivo))); aviso('Respaldo restaurado'); refrescar(); }
    catch (err) { aviso(err.message, 'mal'); }
  });
}

async function exportar(formato) {
  const fecha = hoyISO();
  if (formato === 'json') descargar(`bitacora-respaldo-${fecha}.json`, JSON.stringify(await DB.respaldo(), null, 2), 'application/json');
  if (formato === 'tidy') descargar(`bitacora-${fecha}.csv`, '﻿' + L.asientosATidyCSV(estado.asientos, estado.cuentas), 'text/csv');
  if (formato === 'hledger') descargar(`bitacora-${fecha}.journal`, L.asientosAHledger(estado.asientos, estado.cuentas));
}

async function iniciar() {
  const existentes = await DB.todos('cuentas');
  const ids = new Set(existentes.map((c) => c.id));
  const faltantes = L.cuentasPorDefecto().filter((c) => !ids.has(c.id));
  if (faltantes.length) await DB.guardarVarios('cuentas', faltantes);
}

async function tarjeta() {
  await cargar();
  const mes = hoyISO().slice(0, 7);
  const er = L.estadoResultados(estado.asientos, estado.cuentas, `${mes}-01`, L.finDeMes(mes));
  const bg = L.balanceGeneral(estado.asientos, estado.cuentas, hoyISO());
  return h`<dl class="mini"><div><dt>Resultado del mes</dt><dd class="${er.resultado >= 0 ? 'pos' : 'neg'}">${fmt(er.resultado)}</dd></div>
    <div><dt>Patrimonio neto</dt><dd>${fmt(bg.patrimonioNeto)}</dd></div></dl>`;
}

export default {
  id: 'finanzas', nombre: 'Finanzas', icono: '💰', estado: 'activo',
  descripcion: 'Contabilidad personal de partida doble, presupuesto, honorarios con retención y control de renta.',
  iniciar, montar, tarjeta,
};
