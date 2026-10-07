// Utilidades mínimas de interfaz: plantillas seguras, avisos, descargas y gráficos SVG.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

// Plantilla etiquetada: escapa interpolaciones salvo que vengan marcadas con crudo().
const CRUDO = Symbol('crudo');
export const crudo = (html) => ({ [CRUDO]: true, html });
export function html(partes, ...valores) {
  return partes.reduce((out, p, i) => {
    if (i === 0) return p;
    const v = valores[i - 1];
    const s = Array.isArray(v) ? v.map((x) => (x?.[CRUDO] ? x.html : esc(x))).join('')
      : v?.[CRUDO] ? v.html : esc(v);
    return out + s + p;
  }, '');
}
export const h = (...a) => crudo(html(...a));

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

export function aviso(msg, tipo = 'ok') {
  const el = document.createElement('div');
  el.className = `aviso aviso-${tipo}`;
  el.setAttribute('role', 'status');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('fuera'), 2600);
  setTimeout(() => el.remove(), 3000);
}

export function descargar(nombre, contenido, tipo = 'text/plain') {
  const url = URL.createObjectURL(new Blob([contenido], { type: `${tipo};charset=utf-8` }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const leerArchivo = (archivo) => new Promise((ok, mal) => {
  const r = new FileReader();
  r.onload = () => ok(r.result);
  r.onerror = () => mal(r.error);
  r.readAsText(archivo);
});

export const hoyISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export const formularioAObjeto = (form) => Object.fromEntries(new FormData(form).entries());

// Barras agrupadas ingresos/gastos + línea de resultado. Sin librerías.
export function graficoMensual(serie, fmt) {
  const W = 640, H = 220, M = { t: 16, r: 8, b: 28, l: 8 };
  const max = Math.max(1, ...serie.flatMap((d) => [d.ingresos, d.gastos]));
  const ancho = (W - M.l - M.r) / serie.length;
  const y = (v) => M.t + (H - M.t - M.b) * (1 - v / max);
  const barras = serie.map((d, i) => {
    const x = M.l + i * ancho, b = Math.max(2, ancho * 0.32);
    const mes = new Date(`${d.mes}-15`).toLocaleDateString('es-CO', { month: 'short' });
    return `<g><title>${esc(d.mes)} · ingresos ${esc(fmt(d.ingresos))} · gastos ${esc(fmt(d.gastos))} · resultado ${esc(fmt(d.resultado))}</title>
      <rect x="${x + ancho / 2 - b - 1}" y="${y(d.ingresos)}" width="${b}" height="${H - M.b - y(d.ingresos)}" rx="2" class="g-ing"/>
      <rect x="${x + ancho / 2 + 1}" y="${y(d.gastos)}" width="${b}" height="${H - M.b - y(d.gastos)}" rx="2" class="g-gas"/>
      <text x="${x + ancho / 2}" y="${H - 8}" text-anchor="middle" class="g-eje">${esc(mes)}</text></g>`;
  }).join('');
  return crudo(`<svg viewBox="0 0 ${W} ${H}" class="grafico" role="img" aria-label="Ingresos y gastos por mes">
    <line x1="${M.l}" x2="${W - M.r}" y1="${H - M.b}" y2="${H - M.b}" class="g-base"/>${barras}</svg>`);
}

export function barraProgreso(uso) {
  const pct = Math.min(100, Math.max(0, uso * 100));
  const estado = uso > 1 ? 'mal' : uso > 0.85 ? 'alerta' : 'ok';
  return h`<div class="progreso" role="progressbar" aria-valuenow="${Math.round(uso * 100)}" aria-valuemin="0" aria-valuemax="100"><span class="p-${estado}" style="width:${pct}%"></span></div>`;
}
