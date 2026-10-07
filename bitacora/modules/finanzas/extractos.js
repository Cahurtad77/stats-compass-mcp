// Sección Extractos: importar años de movimientos bancarios (PDF, foto, Excel o CSV),
// revisarlos en una zona aparte y clasificarlos por grupos de comercio antes de contabilizarlos.
import * as L from './ledger.js';
import * as DB from '../../core/db.js';
import * as IA from './ia.js';
import { leerXlsx } from '../../core/xlsx.js';
import { h, $, aviso, leerArchivo, formularioAObjeto } from '../../core/ui.js';

const fmt = (c) => L.formatoMoneda(c);
const cola = { tabulares: [], ia: [], procesando: null, errores: [] }; // vive mientras la página esté abierta
let verGrupos = 40;

const esTabular = (f) => /\.(csv|txt|xlsx)$/i.test(f.name);
const esIA = (f) => f.type === 'application/pdf' || f.type.startsWith('image/') || /\.pdf$/i.test(f.name);
const restarDia = (iso) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };

function opcionesRubro(cuentas, signo, sel) {
  const grupos = signo > 0 ? ['ingreso', 'activo', 'pasivo'] : ['gasto', 'activo', 'pasivo'];
  const etiqueta = { ingreso: 'Ingresos', gasto: 'Gastos', activo: 'Traslado a cuenta propia', pasivo: 'Pago de deuda / tarjeta' };
  return h`<option value="">— Elegir rubro —</option>${grupos.map((t) => h`<optgroup label="${etiqueta[t]}">
    ${cuentas.filter((c) => c.tipo === t && c.activa).map((c) => h`<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${c.nombre}</option>`)}</optgroup>`)}`;
}

export function vistaExtractos(estado, { conIA, filas, lotes }) {
  const pend = filas.filter((f) => f.estado === 'pendiente');
  const listos = pend.filter((f) => f.rubro).length + filas.filter((f) => f.estado === 'transferencia').length;
  const posibles = filas.filter((f) => f.estado === 'posible_duplicada');
  const grupos = L.agruparPorComercio(filas);
  const cuentasPropias = estado.cuentas.filter((c) => ['activo', 'pasivo'].includes(c.tipo) && c.activa);
  const tab = cola.tabulares[0];
  return h`<section class="panel"><h2>1. Sube tus extractos</h2>
      <p class="sutil">Puedes subir varios a la vez, de varios bancos y meses. <strong>Excel y CSV</strong> se leen en tu dispositivo, gratis.
        <strong>PDF y fotos</strong> se transcriben con IA${conIA ? '' : h` (<a href="#/finanzas/datos">activa la lectura con IA</a>)`}: cada página cuesta unos centavos de dólar.
        Nada entra a tu contabilidad hasta que lo revises.</p>
      <label class="btn archivo">📄 Elegir extractos<input type="file" id="arch-extractos" accept=".pdf,.csv,.txt,.xlsx,image/*" multiple hidden></label>
      ${cola.procesando ? h`<p class="alerta-caja" aria-live="polite">⏳ Leyendo con IA: ${cola.procesando} · faltan ${cola.ia.length}</p>` : ''}
      ${cola.errores.map((e) => h`<p class="alerta-caja">⚠️ ${e}</p>`)}
    </section>
    ${tab ? h`<form id="f-tabla" class="panel formulario"><h2>Columnas de “${tab.nombre}”</h2>
      ${(() => {
        const cab = tab.filas[0] || [];
        const adivina = (re) => cab.findIndex((c) => re.test(String(c)));
        const sel = (nombre, idx, opcional) => h`<select name="${nombre}">${opcional ? h`<option value="-1">— No aplica —</option>` : ''}${cab.map((c, i) => h`<option value="${i}" ${i === idx ? 'selected' : ''}>${c || `Columna ${i + 1}`}</option>`)}</select>`;
        const iDeb = adivina(/d[eé]bito|cargo|retiro|salida/i), iCre = adivina(/cr[eé]dito|abono|dep[oó]sito|entrada/i), iVal = adivina(/valor|monto|importe|amount/i);
        return h`<div class="campos">
          <label>Fecha${sel('colFecha', Math.max(0, adivina(/fecha|date/i)))}</label>
          <label>Descripción${sel('colDescripcion', Math.max(0, adivina(/desc|concepto|detalle|transacci/i)))}</label>
          <label>Valor con signo${sel('colMonto', iDeb >= 0 && iCre >= 0 ? -1 : iVal, true)}</label>
          <label>o Débitos${sel('colDebito', iDeb, true)}</label>
          <label>y Créditos${sel('colCredito', iCre, true)}</label>
          <label>Cuenta del extracto<select name="cuenta">${cuentasPropias.map((c) => h`<option value="${c.id}" ${c.id === (/tarjeta|visa|master|cr[eé]dito/i.test(tab.nombre) ? 'tc' : 'banco') ? 'selected' : ''}>${c.nombre}</option>`)}</select></label>
          <label class="check"><input type="checkbox" name="invertir"> Invertir signos</label></div>
          <p class="sutil">${tab.filas.length - 1} filas. Ejemplo: ${tab.filas.slice(1, 3).map((f) => f.join(' | ')).join(' ⏎ ')}</p>`;
      })()}
      <div class="acciones"><button class="btn">Agregar a revisión</button><button type="button" class="btn-sec" data-saltar-tabla>Omitir archivo</button></div></form>` : ''}
    ${lotes.length ? h`<section class="panel"><h2>Extractos cargados (${lotes.length})</h2>
      <table class="tabla lotes"><thead><tr><th>Extracto</th><th>Período</th><th class="num">Mov.</th><th>Cuadre</th><th>Cuenta</th><th></th></tr></thead><tbody>
      ${[...lotes].sort((a, b) => (a.desde || '').localeCompare(b.desde || '')).map((l) => {
        const deLote = filas.filter((f) => f.lote === l.id), cont = deLote.filter((f) => f.estado === 'contabilizada').length;
        return h`<tr><td>${l.banco || l.archivo}${l.ultimos4 ? ` ****${l.ultimos4}` : ''}<br><span class="sutil">${l.archivo}</span></td>
          <td class="nowrap">${l.desde || '?'} → ${l.hasta || '?'}</td>
          <td class="num">${deLote.length}${cont ? h`<br><span class="sutil">${cont} contab.</span>` : ''}</td>
          <td>${l.cuadra === true ? h`<span class="pos">✓ cuadra</span>` : l.cuadra === false ? h`<span class="neg" title="Diferencia ${fmt(l.diferencia)}">✗ ${fmt(l.diferencia)}</span>` : h`<span class="sutil">—</span>`}</td>
          <td><select data-cuenta-lote="${l.id}" aria-label="Cuenta del extracto">${cuentasPropias.map((c) => h`<option value="${c.id}" ${c.id === l.cuenta ? 'selected' : ''}>${c.nombre}</option>`)}<option value="__nueva">+ Nueva cuenta…</option></select>
            ${l.saldoInicial != null && !l.saldoUsado ? h`<br><button class="btn-sec mini" data-saldo-lote="${l.id}">Usar saldo inicial ${fmt(l.saldoInicial)}</button>` : ''}</td>
          <td><button class="icono" data-borrar-lote="${l.id}" aria-label="Deshacer este extracto">🗑</button></td></tr>`;
      })}</tbody></table>
      <p class="sutil">Si un extracto no cuadra, puede faltar una página o un movimiento: revisa antes de contabilizar.</p></section>` : ''}
    ${filas.length ? h`<section class="panel"><div class="panel-cabeza"><h2>2. Clasifica</h2>
        <div class="botonera">
          ${conIA && grupos.some((g) => g.sinRubro) ? h`<button class="btn-sec" data-ia-grupos>✨ Sugerir con IA los grupos sin rubro</button>` : ''}
          <button class="btn" data-contabilizar ${listos ? '' : 'disabled'}>Pasar ${listos} a la contabilidad</button></div></div>
      <p class="chips">
        <span class="chip">${pend.length} por revisar</span><span class="chip">${pend.filter((f) => f.rubro).length} con rubro</span>
        <span class="chip">${pend.filter((f) => !f.rubro).length} sin rubro</span><span class="chip">${filas.filter((f) => f.estado === 'transferencia').length} transferencias entre tus cuentas</span>
        <span class="chip">${filas.filter((f) => f.estado === 'duplicada').length} duplicados omitidos</span><span class="chip">${filas.filter((f) => f.estado === 'contabilizada').length} ya contabilizados</span></p>
      <p class="sutil">Cada fila es un comercio con todos sus movimientos. Elige el rubro una vez y se aplica a todo el grupo; con “recordar” la app creará la regla para el futuro.
        Los pagos de tarjeta y traslados entre tus cuentas se detectan solos.</p>
      ${grupos.slice(0, verGrupos).map((g) => h`<div class="grupo ${g.sinRubro ? 'sin-rubro' : ''}">
        <div class="grupo-info"><strong>${g.clave}</strong> <span class="sutil">· ${g.filas.length} mov. · ${fmt(g.total)} ${g.signo > 0 ? '(entradas)' : ''}</span><br>
          <span class="sutil">${g.ejemplo}</span>${g.filas[0].motivo && g.rubro ? h` <span class="chip">${g.filas[0].motivo}</span>` : ''}</div>
        <div class="grupo-acc"><select data-rubro-grupo="${g.clave}" aria-label="Rubro para ${g.clave}">${opcionesRubro(estado.cuentas, g.signo, g.rubro)}</select>
          <label class="check"><input type="checkbox" data-recordar="${g.clave}" checked> recordar</label></div>
        <details><summary>Ver movimientos</summary><table class="tabla"><tbody>${g.filas.map((f) => h`<tr><td class="nowrap">${f.fecha}</td><td>${f.descripcion}</td>
          <td class="num ${f.monto < 0 ? 'neg' : 'pos'}">${fmt(f.monto)}</td><td><select data-rubro-fila="${f.id}" aria-label="Rubro">${opcionesRubro(estado.cuentas, Math.sign(f.monto), f.rubro)}</select></td></tr>`)}</tbody></table></details>
      </div>`)}
      ${grupos.length > verGrupos ? h`<button class="btn-sec" data-mas-grupos>Ver más grupos (${grupos.length - verGrupos})</button>` : ''}
      ${!grupos.length ? h`<p class="ok-caja">Todo lo pendiente está clasificado o contabilizado.</p>` : ''}
    </section>` : ''}
    ${posibles.length ? h`<section class="panel"><h2>¿Ya los habías registrado? (${posibles.length})</h2>
      <p class="sutil">Estos movimientos del extracto se parecen a uno que ya registraste a mano o desde una foto de WhatsApp (misma cuenta y valor, ±3 días).</p>
      <table class="tabla"><tbody>${posibles.map((f) => { const a = estado.asientos.find((x) => x.id === f.asientoId); return h`<tr>
        <td>${f.fecha} · ${f.descripcion}<br><span class="sutil">Registrado: ${a ? `${a.fecha} · ${a.descripcion || a.tercero}` : '—'}</span></td><td class="num">${fmt(f.monto)}</td>
        <td class="nowrap"><button class="btn-sec" data-mismo="${f.id}">Es el mismo</button> <button class="btn-sec" data-distinto="${f.id}">Son distintos</button></td></tr>`; })}</tbody></table></section>` : ''}`;
}

async function crearLote(estado, lote, filasLote) {
  const guardado = await DB.guardar('lotes', lote);
  const existentes = await DB.todos('importacion');
  let nuevas = filasLote.map((f) => ({ ...f, id: DB.nuevoId(), lote: guardado.id, cuenta: lote.cuenta }));
  nuevas = L.marcarDuplicados(nuevas, existentes, estado.asientos);
  nuevas = L.autoclasificar(nuevas, estado.asientos, estado.reglas, estado.cuentas);
  await DB.guardarVarios('importacion', nuevas);
  await reemparejar();
  return nuevas;
}

async function reemparejar() {
  const todas = await DB.todos('importacion');
  const antes = new Map(todas.map((f) => [f.id, JSON.stringify(f)]));
  const despues = L.emparejarTransferencias(todas);
  const cambiadas = despues.filter((f) => antes.get(f.id) !== JSON.stringify(f));
  if (cambiadas.length) await DB.guardarVarios('importacion', cambiadas);
}

async function cuentaPara(estado, r) {
  const mapa = await DB.ajuste('mapa_cuentas', {});
  const k = `${(r.banco || '').toUpperCase()}|${r.ultimos4 || ''}`;
  if (mapa[k] && estado.cuentas.some((c) => c.id === mapa[k])) return mapa[k];
  return r.tipo_cuenta === 'tarjeta_credito' ? 'tc' : 'banco';
}

async function procesarColaIA(estado, refrescar) {
  if (cola.procesando) return;
  while (cola.ia.length) {
    const archivo = cola.ia.shift();
    cola.procesando = archivo.name; refrescar();
    try {
      const r = await IA.leerExtracto(archivo);
      if (!r.es_extracto) { cola.errores.push(`${archivo.name}: no parece un extracto bancario.`); continue; }
      const movimientos = r.movimientos.map((m) => ({ fecha: L.normalizarFecha(m.fecha), descripcion: m.descripcion, monto: Math.round(m.valor * 100) }))
        .filter((m) => m.fecha && Number.isFinite(m.monto) && m.monto !== 0);
      const esTarjeta = r.tipo_cuenta === 'tarjeta_credito';
      const cz = L.conciliar({ saldoInicial: r.saldo_inicial == null ? NaN : Math.round(r.saldo_inicial * 100), saldoFinal: r.saldo_final == null ? NaN : Math.round(r.saldo_final * 100), movimientos: movimientos.map((m) => m.monto), esTarjeta });
      await crearLote(estado, {
        archivo: archivo.name, origen: 'ia', banco: r.banco, ultimos4: r.ultimos4, tipoCuenta: r.tipo_cuenta,
        desde: r.periodo_desde || movimientos[0]?.fecha, hasta: r.periodo_hasta || movimientos.at(-1)?.fecha,
        saldoInicial: r.saldo_inicial == null ? null : Math.round(r.saldo_inicial * 100) * (esTarjeta ? -1 : 1),
        cuadra: cz.cuadra, diferencia: cz.diferencia, cuenta: await cuentaPara(estado, r), observaciones: r.observaciones, tokens: r.uso,
      }, movimientos.map((m) => ({ ...m, clave: L.claveComercio(m.descripcion), rubro: null, motivo: null, estado: 'pendiente' })));
      if (cz.cuadra === false) cola.errores.push(`${archivo.name}: los saldos no cuadran por ${fmt(cz.diferencia)}. Revisa si falta una página.`);
    } catch (e) {
      cola.errores.push(`${archivo.name}: ${e.message}`);
      if (/clave|saldo|permiso/i.test(e.message)) { cola.ia.length = 0; }
    }
  }
  cola.procesando = null;
  refrescar();
}

export function conectarExtractos(el, estado, refrescar, { filas, lotes }) {
  const porId = new Map(filas.map((f) => [f.id, f]));
  $('#arch-extractos', el)?.addEventListener('change', async (e) => {
    cola.errores = [];
    const archivos = [...e.target.files];
    for (const f of archivos) {
      try {
        if (/\.xlsx$/i.test(f.name)) cola.tabulares.push({ nombre: f.name, filas: await leerXlsx(await f.arrayBuffer()) });
        else if (esTabular(f)) cola.tabulares.push({ nombre: f.name, filas: L.parseCSV(await leerArchivo(f)) });
        else if (esIA(f)) cola.ia.push(f);
        else cola.errores.push(`${f.name}: formato no soportado (usa PDF, Excel .xlsx, CSV o foto).`);
      } catch (err) { cola.errores.push(`${f.name}: ${err.message}`); }
    }
    if (cola.ia.length && !(await DB.ajuste('ia_clave', ''))) {
      cola.errores.push(`${cola.ia.length} PDF/foto(s) necesitan la lectura con IA. Actívala en Importar / Exportar, o descarga el extracto en Excel/CSV.`);
      cola.ia.length = 0;
    }
    refrescar();
    procesarColaIA(estado, refrescar);
  });

  $('#f-tabla', el)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formularioAObjeto(e.target), tab = cola.tabulares[0];
    if (+d.colMonto < 0 && +d.colDebito < 0 && +d.colCredito < 0) return aviso('Elige la columna de valor, o las de débitos y créditos', 'mal');
    const { filas: nuevas, errores } = L.tablaAFilas(tab.filas, { colFecha: +d.colFecha, colDescripcion: +d.colDescripcion, colMonto: +d.colMonto, colDebito: +d.colDebito, colCredito: +d.colCredito, cuenta: d.cuenta, invertir: !!d.invertir });
    if (!nuevas.length) return aviso('No encontré movimientos válidos con esas columnas', 'mal');
    const fechas = nuevas.map((f) => f.fecha).sort();
    await crearLote(estado, { archivo: tab.nombre, origen: 'tabla', cuenta: d.cuenta, desde: fechas[0], hasta: fechas.at(-1), cuadra: null, saldoInicial: null }, nuevas);
    cola.tabulares.shift();
    aviso(`${nuevas.length} movimientos en revisión${errores.length ? ` · ${errores.length} filas omitidas` : ''}`);
    refrescar();
  });

  el.querySelectorAll('[data-cuenta-lote]').forEach((s) => s.addEventListener('change', async () => {
    const lote = lotes.find((l) => l.id === s.dataset.cuentaLote);
    let cuenta = s.value;
    if (cuenta === '__nueva') {
      const nombre = prompt('Nombre de la cuenta (p. ej. "Davivienda ahorros ****1234")', `${lote.banco || ''} ${lote.ultimos4 ? `****${lote.ultimos4}` : ''}`.trim());
      if (!nombre) return refrescar();
      const tipo = lote.tipoCuenta === 'tarjeta_credito' ? 'pasivo' : 'activo';
      const n = estado.cuentas.filter((c) => c.tipo === tipo).length;
      cuenta = (await DB.guardar('cuentas', { nombre, tipo, codigo: tipo === 'pasivo' ? `21${String(50 + n).padStart(2, '0')}` : `11${String(20 + n).padStart(2, '0')}`, activa: true })).id;
    }
    await DB.guardar('lotes', { ...lote, cuenta });
    await DB.guardarVarios('importacion', filas.filter((f) => f.lote === lote.id && f.estado !== 'contabilizada').map((f) => ({ ...f, cuenta })));
    if (lote.banco || lote.ultimos4) { const mapa = await DB.ajuste('mapa_cuentas', {}); mapa[`${(lote.banco || '').toUpperCase()}|${lote.ultimos4 || ''}`] = cuenta; await DB.fijarAjuste('mapa_cuentas', mapa); }
    await reemparejar();
    refrescar();
  }));

  el.querySelectorAll('[data-rubro-grupo]').forEach((s) => s.addEventListener('change', async () => {
    const clave = s.dataset.rubroGrupo, rubro = s.value || null;
    const recordar = el.querySelector(`[data-recordar="${CSS.escape(clave)}"]`)?.checked;
    await DB.guardarVarios('importacion', filas.filter((f) => f.estado === 'pendiente' && f.clave === clave).map((f) => ({ ...f, rubro, motivo: rubro ? 'tú' : null })));
    if (rubro && recordar) {
      const previa = estado.reglas.find((r) => r.clave === clave);
      await DB.guardar('reglas', { id: previa?.id, clave, contiene: '', cuenta: rubro });
    }
    refrescar();
  }));
  el.querySelectorAll('[data-rubro-fila]').forEach((s) => s.addEventListener('change', async () => {
    const f = porId.get(s.dataset.rubroFila);
    await DB.guardar('importacion', { ...f, rubro: s.value || null, motivo: 'tú' });
    refrescar();
  }));

  el.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if ('saltarTabla' in d) { cola.tabulares.shift(); refrescar(); }
    else if ('masGrupos' in d) { verGrupos += 40; refrescar(); }
    else if (d.mismo) { await DB.guardar('importacion', { ...porId.get(d.mismo), estado: 'descartada' }); refrescar(); }
    else if (d.distinto) { await DB.guardar('importacion', { ...porId.get(d.distinto), estado: 'pendiente', asientoId: undefined }); refrescar(); }
    else if (d.borrarLote) {
      const lote = lotes.find((l) => l.id === d.borrarLote);
      const asientos = estado.asientos.filter((a) => a.lote === lote.id);
      if (!confirm(`¿Deshacer “${lote.archivo}”? Se quitan sus ${filas.filter((f) => f.lote === lote.id).length} movimientos de la revisión${asientos.length ? ` y ${asientos.length} asientos ya contabilizados` : ''}.`)) return;
      await DB.borrarVarios('asientos', asientos.map((a) => a.id));
      await DB.borrarVarios('importacion', filas.filter((f) => f.lote === lote.id).map((f) => f.id));
      await DB.borrar('lotes', lote.id);
      // Las transferencias emparejadas con este extracto vuelven a quedar pendientes
      const huerfanas = filas.filter((f) => f.lote !== lote.id && f.parId && porId.get(f.parId)?.lote === lote.id && f.estado === 'transferencia');
      if (huerfanas.length) await DB.guardarVarios('importacion', huerfanas.map((f) => ({ ...f, estado: 'pendiente', parId: undefined, rubro: null, motivo: null })));
      aviso('Extracto deshecho'); refrescar();
    } else if (d.saldoLote) {
      const lote = lotes.find((l) => l.id === d.saldoLote);
      const fecha = restarDia(lote.desde);
      await DB.guardar('asientos', { fecha, descripcion: `Saldo inicial ${lote.banco || ''} ${lote.ultimos4 ? `****${lote.ultimos4}` : ''}`.trim(), tipo: 'apertura', etiquetas: [],
        partidas: [{ cuenta: lote.cuenta, monto: lote.saldoInicial }, { cuenta: 'patrimonio', monto: -lote.saldoInicial }].filter((p) => p.monto !== 0) });
      await DB.guardar('lotes', { ...lote, saldoUsado: true });
      aviso('Saldo inicial registrado'); refrescar();
    } else if ('iaGrupos' in d) {
      const grupos = L.agruparPorComercio(filas).filter((g) => g.sinRubro).slice(0, 150);
      b.disabled = true; b.textContent = `Clasificando ${grupos.length} grupos…`;
      try {
        const historial = estado.reglas.filter((r) => r.clave).slice(0, 40).map((r) => ({ tercero: r.clave, cuenta: r.cuenta }));
        const r = await IA.clasificarGrupos(grupos.map((g) => ({ clave: g.clave, ejemplo: g.ejemplo, signo: g.signo, n: g.filas.length, total: g.total })), { cuentas: estado.cuentas, historial });
        const sugeridas = new Map(r.grupos.filter((x) => x.confianza !== 'baja').map((x) => [x.clave, x.rubro]));
        const tipo = Object.fromEntries(estado.cuentas.map((c) => [c.id, c.tipo]));
        const cambios = filas.filter((f) => f.estado === 'pendiente' && !f.rubro && sugeridas.has(f.clave))
          .map((f) => ({ ...f, rubro: sugeridas.get(f.clave), motivo: 'IA' }))
          .filter((f) => (f.monto > 0 ? tipo[f.rubro] !== 'gasto' : tipo[f.rubro] !== 'ingreso'));
        await DB.guardarVarios('importacion', cambios);
        aviso(`IA sugirió rubro para ${new Set(cambios.map((f) => f.clave)).size} grupos. Revisa antes de contabilizar; los dudosos quedan para ti.`);
      } catch (err) { aviso(err.message, 'mal'); }
      refrescar();
    } else if ('contabilizar' in d) {
      const tipo = Object.fromEntries(estado.cuentas.map((c) => [c.id, c.tipo]));
      const lote = []; // [{ asiento, filas }]
      for (const f of filas) {
        if (f.estado === 'transferencia') {
          const par = porId.get(f.parId);
          if (!par || f.monto > 0 || par.estado !== 'transferencia') continue; // se crea una sola vez, desde la salida
          lote.push({ asiento: L.filaAAsiento({ ...f, rubro: par.cuenta }, estado.cuentas), filas: [f, par] });
        } else if (f.estado === 'pendiente' && f.rubro && f.rubro !== f.cuenta && tipo[f.rubro] && tipo[f.rubro] !== 'patrimonio') {
          lote.push({ asiento: L.filaAAsiento(f, estado.cuentas), filas: [f] });
        }
      }
      // Lo que sugirió la IA y aceptaste con "recordar" queda como regla: el próximo extracto no necesita IA.
      const recordar = new Set([...el.querySelectorAll('[data-recordar]:checked')].map((c) => c.dataset.recordar));
      const nuevasReglas = new Map();
      for (const { filas: fs } of lote) for (const f of fs) {
        if (f.motivo === 'IA' && recordar.has(f.clave) && !estado.reglas.some((r) => r.clave === f.clave)) nuevasReglas.set(f.clave, f.rubro);
      }
      if (nuevasReglas.size) await DB.guardarVarios('reglas', [...nuevasReglas].map(([clave, cuenta]) => ({ clave, contiene: '', cuenta })));
      const validos = lote.filter((x) => !L.validarAsiento(x.asiento).length);
      const guardados = await DB.guardarVarios('asientos', validos.map((x) => x.asiento));
      await DB.guardarVarios('importacion', validos.flatMap((x, i) => x.filas.map((f) => ({ ...f, estado: 'contabilizada', asientoId: guardados[i].id }))));
      aviso(`${guardados.length} movimientos contabilizados`);
      refrescar();
    }
  };
}

export async function cargarImportacion() {
  const [filas, lotes] = await Promise.all([DB.todos('importacion'), DB.todos('lotes')]);
  return { filas, lotes };
}
