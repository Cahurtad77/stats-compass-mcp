import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as L from '../modules/finanzas/ledger.js';
import { crearZip, crc32 } from '../core/zip.js';

const cuentas = L.cuentasPorDefecto();
const gasto = (fecha, monto, destino, tercero, extra = {}) => ({ ...L.movimientoAAsiento({ tipo: 'gasto', fecha, monto, origen: 'banco', destino, tercero, descripcion: tercero }), ...extra });

test('sugerirCuenta: regla > historial > palabra clave', () => {
  const hist = [gasto('2026-01-02', 10_000_00, 'ocio', 'Tienda Don Pepe'), gasto('2026-02-02', 12_000_00, 'ocio', 'Tienda Don Pepe')];
  assert.deepEqual(L.sugerirCuenta({ tercero: 'TIENDA DON PEPE' }, hist, [], cuentas), { cuenta: 'ocio', motivo: 'historial' });
  assert.deepEqual(L.sugerirCuenta({ tercero: 'Tienda Don Pepe' }, hist, [{ contiene: 'pepe', cuenta: 'alimentacion' }], cuentas).motivo, 'regla');
  assert.equal(L.sugerirCuenta({ descripcion: 'Droguería Cruz Verde' }, [], [], cuentas).cuenta, 'salud');
  assert.equal(L.sugerirCuenta({ descripcion: 'NETFLIX.COM' }, [], [], cuentas).cuenta, 'suscripciones');
  assert.equal(L.sugerirCuenta({ descripcion: 'algo raro' }, [], [], cuentas).cuenta, null);
  // Una regla que apunta a un ingreso no se usa para un gasto
  assert.equal(L.sugerirCuenta({ descripcion: 'x' }, [], [{ contiene: 'x', cuenta: 'salario' }], cuentas).cuenta, null);
});

test('detectarFugas encuentra suscripción, hormiga, anomalía y costos financieros', () => {
  const A = [];
  for (const m of ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']) {
    A.push(gasto(`${m}-03`, 44_900_00, 'ocio', 'Plataforma Streaming'));
    A.push(gasto(`${m}-10`, 1_000_000_00, 'alimentacion', 'Supermercado'));
    A.push(gasto(`${m}-12`, [280, 340, 310, 265, 355, 300][Number(m.slice(5)) - 4] * 1_000_00, 'transporte', 'Gasolina'));
  }
  A.push(gasto('2026-10-01', 2_400_000_00, 'alimentacion', 'Supermercado'));
  for (let d = 1; d <= 24; d++) A.push(gasto(`2026-09-${String(10 + (d % 20)).padStart(2, '0')}`, 15_000_00, 'alimentacion', `Tinto ${d}`));
  A.push(gasto('2026-08-15', 85_000_00, 'financieros', 'Intereses TC'));
  const f = L.detectarFugas(A, cuentas, '2026-10-05');
  const tipos = f.map((x) => x.tipo);
  assert.ok(tipos.includes('recurrente'), 'suscripción');
  assert.deepEqual(f.filter((x) => x.tipo === 'recurrente').map((x) => x.titulo), ['Cobro recurrente: Plataforma Streaming']);
  assert.ok(tipos.includes('hormiga'), 'hormiga');
  assert.ok(f.some((x) => x.tipo === 'anomalia' && x.cuenta === 'alimentacion'), 'anomalía');
  assert.ok(tipos.includes('financiero'));
  // Ordenado por impacto anual
  for (let i = 1; i < f.length; i++) assert.ok(f[i - 1].impactoAnual >= f[i].impactoAnual);
  // Obligaciones como el arriendo no se reportan como fuga
  const conArriendo = [...A, ...['2026-07', '2026-08', '2026-09'].map((m) => gasto(`${m}-01`, 1_900_000_00, 'vivienda', 'Arriendo'))];
  assert.ok(!L.detectarFugas(conArriendo, cuentas, '2026-10-05').some((x) => x.titulo.includes('Arriendo')));
  // Si ya está declarado como recurrente, no se reporta
  assert.ok(!L.detectarFugas(A, cuentas, '2026-10-05', { recurrentesConocidos: ['Plataforma Streaming'] }).some((x) => x.tipo === 'recurrente'));
});

test('estadoMeta: vacaciones (ahorro) y apoyo (gasto)', () => {
  const vac = { id: 'v1', tipo: 'vacaciones', objetivo: 6_000_000_00, fecha: '2027-06-30', partes: [{ nombre: 'tiquetes', monto: 2_000_000_00 }] };
  const A = [
    { ...L.movimientoAAsiento({ tipo: 'transferencia', fecha: '2026-09-30', monto: 1_000_000_00, origen: 'banco', destino: 'ahorro_metas' }), etiquetas: ['meta:v1'] },
    { ...gasto('2026-10-02', 1_500_000_00, 'vacaciones', 'Avianca'), etiquetas: ['meta:v1', 'parte:tiquetes'] },
    { ...gasto('2026-09-05', 800_000_00, 'apoyo_mama', 'Mamá'), etiquetas: ['meta:m1'] },
  ];
  const e = L.estadoMeta(vac, A, cuentas, '2026-10-07');
  assert.equal(e.aportado, 1_000_000_00);
  assert.equal(e.mesesRestantes, 8);
  assert.equal(e.aporteSugerido, Math.ceil(5_000_000_00 / 8));
  assert.equal(e.partes[0].gastado, 1_500_000_00);
  const apoyo = L.estadoMeta({ id: 'm1', tipo: 'apoyo', objetivo: 9_600_000_00 }, A, cuentas, '2026-10-07');
  assert.equal(apoyo.gastado, 800_000_00);
  assert.ok(Math.abs(apoyo.avance - 800 / 9600) < 1e-9);
});

test('proyeccionInversion con interés compuesto', () => {
  const p = L.proyeccionInversion({ capital: 10_000_000_00, aporteMensual: 0, tasaEA: 0.1, anios: 2 });
  assert.equal(p.final, Math.round(10_000_000_00 * 1.21));
  const q = L.proyeccionInversion({ capital: 0, aporteMensual: 100_00, tasaEA: 0, anios: 1 });
  assert.equal(q.final, 1_200_00);
  assert.equal(q.serie.length, 1);
});

test('proyectarFlujo detecta el punto más bajo de caja', () => {
  const rec = [
    { id: 'r1', frecuencia: 'mensual', inicio: '2026-01-05', ultima: '2026-10-05', plantilla: { tipo: 'ingreso', origen: 'salario', destino: 'banco', monto: 5_000_000_00, descripcion: 'Nómina' } },
    { id: 'r2', frecuencia: 'mensual', inicio: '2026-01-01', plantilla: { tipo: 'gasto', origen: 'banco', destino: 'vivienda', monto: 2_000_000_00, descripcion: 'Arriendo' } },
  ];
  const f = L.proyectarFlujo(rec, cuentas, 500_000_00, '2026-10-07', 2);
  assert.deepEqual(f.eventos.map((e) => e.fecha), ['2026-11-01', '2026-11-05', '2026-12-01', '2026-12-05']);
  assert.equal(f.minimo.saldo, -1_500_000_00);
  assert.equal(f.minimo.fecha, '2026-11-01');
  assert.equal(f.saldoFinal, 500_000_00 + 2 * 3_000_000_00);
});

test('crearZip produce un ZIP válido', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const zip = crearZip([{ nombre: 'movimientos.csv', datos: 'a,b\n1,2\n' }, { nombre: 'soportes/foto ñ.jpg', datos: new Uint8Array([255, 216, 255, 0, 1, 2]) }]);
  const dir = mkdtempSync(join(tmpdir(), 'zip-'));
  writeFileSync(join(dir, 'p.zip'), zip);
  const salida = execFileSync('python3', ['-I', '-c', 'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print("|".join(z.namelist())); print(z.read("movimientos.csv").decode())', join(dir, 'p.zip')]).toString();
  assert.match(salida, /movimientos\.csv\|soportes\/foto ñ\.jpg/);
  assert.match(salida, /1,2/);
});
