// Shell de Bitácora: registro de módulos + enrutador por hash (#/modulo/seccion).
// Cada módulo expone { id, nombre, icono, descripcion, estado, secciones?, montar(el, seccion), tarjeta?() }.
import { abrir, persistente } from './db.js';
import { h, html, $, $$, rutaActual, navegar, sincronizarDesdeURL } from './ui.js';
import finanzas from '../modules/finanzas/finanzas.js';

// Hoja de ruta: módulos planeados (ver docs/investigacion.md). Se activan uno a uno.
const PROXIMOS = [
  { id: 'agenda', nombre: 'Agenda y tareas', icono: '🗓️', descripcion: 'Tareas, calendario (Google Calendar), bloques de tiempo. Inspirado en Todoist / Lunatask.' },
  { id: 'docencia', nombre: 'Docencia', icono: '🎓', descripcion: 'Cursos, grupos, notas, planeación de clases, horas de cátedra y evidencias para concursos.' },
  { id: 'consultoria', nombre: 'Consultoría', icono: '📊', descripcion: 'Clientes, propuestas, proyectos, horas facturables y cuentas de cobro (se enlaza con Finanzas).' },
  { id: 'academia', nombre: 'Investigación', icono: '📚', descripcion: 'Productos (CvLAC/GrupLAC), referencias (Zotero), manuscritos y metas de escritura.' },
  { id: 'familia', nombre: 'Familia y hogar', icono: '🏡', descripcion: 'Calendario familiar, mercado, mantenimiento, vencimientos (SOAT, predial, pólizas).' },
  { id: 'bienestar', nombre: 'Salud y hábitos', icono: '🌱', descripcion: 'Hábitos, citas médicas, ejercicio y diario breve. Inspirado en Loop Habit Tracker.' },
  { id: 'notas', nombre: 'Notas y documentos', icono: '🗂️', descripcion: 'Notas en Markdown enlazadas (estilo Obsidian) y bóveda de documentos importantes.' },
].map((m) => ({ ...m, estado: 'proximo' }));

const MODULOS = [finanzas, ...PROXIMOS];

function navegacion(actual) {
  return html`<a href="#/" class="${!actual ? 'activo' : ''}"><span aria-hidden="true">🧭</span> Inicio</a>
    ${MODULOS.map((m) => h`<a href="#/${m.id}" class="${actual === m.id ? 'activo' : ''} ${m.estado === 'proximo' ? 'apagado' : ''}">
      <span aria-hidden="true">${m.icono}</span> ${m.nombre}</a>`)}`;
}

async function inicio(el) {
  const tarjetas = await Promise.all(MODULOS.map(async (m) => {
    const extra = m.tarjeta ? await m.tarjeta() : null;
    return h`<a class="tarjeta-modulo ${m.estado === 'proximo' ? 'apagado' : ''}" href="#/${m.id}">
      <div class="tm-cabeza"><span class="tm-icono" aria-hidden="true">${m.icono}</span><strong>${m.nombre}</strong>
      ${m.estado === 'proximo' ? h`<span class="chip">próximamente</span>` : ''}</div>
      <p>${m.descripcion}</p>${extra || ''}</a>`;
  }));
  el.innerHTML = html`<header class="cabecera"><div><h1>Tu bitácora</h1>
    <p class="sutil">Una sola app liviana para tu vida profesional, laboral, familiar y académica. Datos solo en este dispositivo.</p></div></header>
    ${!persistente ? h`<p class="alerta-caja">Este navegador no permite guardar datos (¿modo privado?). Lo que registres se perderá al cerrar.</p>` : ''}
    <section class="rejilla-modulos">${tarjetas}</section>`;
}

function proximo(el, m) {
  el.innerHTML = html`<header class="cabecera"><div><h1>${m.icono} ${m.nombre}</h1><p class="sutil">${m.descripcion}</p></div></header>
    <div class="vacio"><p>Este módulo está en la hoja de ruta. Empezamos por <a href="#/finanzas">Finanzas y contabilidad</a>.</p></div>`;
}

async function enrutar() {
  const [, id, seccion] = rutaActual().replace(/^#/, '').split('/');
  $('#nav').innerHTML = navegacion(id);
  const el = $('#contenido');
  el.onclick = null;
  el.focus({ preventScroll: true });
  const m = MODULOS.find((x) => x.id === id);
  try {
    if (!m) await inicio(el);
    else if (m.estado === 'proximo') proximo(el, m);
    else await m.montar(el, seccion);
  } catch (e) {
    console.error(e);
    el.innerHTML = html`<div class="alerta-caja">Ocurrió un error: ${e.message}</div>`;
  }
  $('body').classList.remove('menu-abierto');
}

async function arrancar() {
  await abrir();
  for (const m of MODULOS) if (m.iniciar) await m.iniciar();
  window.addEventListener('bitacora:ruta', enrutar);
  window.addEventListener('hashchange', () => { if (sincronizarDesdeURL()) enrutar(); });
  // Enlaces internos (#/modulo/seccion) se resuelven aquí, sin depender del hash del marco.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#/"]');
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    navegar(a.getAttribute('href'));
  });
  $('#btn-menu').addEventListener('click', () => $('body').classList.toggle('menu-abierto'));
  $$('[data-tema]').forEach((b) => b.addEventListener('click', () => {
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('bitacora-tema', t); } catch { /* sin almacenamiento */ }
  }));
  await enrutar();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
}

arrancar();
