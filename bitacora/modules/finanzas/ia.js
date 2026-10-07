// Lectura de soportes (fotos de recibos, facturas, comprobantes de transferencia) con la API de Claude.
// La imagen se envía directamente desde el navegador a api.anthropic.com con la clave guardada en
// este dispositivo. El SDK (vendor/) se carga solo cuando se usa esta función.
import * as DB from '../../core/db.js';

export const MODELO = 'claude-opus-5-5';
const LADO_MAX = 1568; // px: más grande no mejora la lectura y cuesta más
const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

let sdk = null;
async function cliente() {
  const apiKey = await DB.ajuste('ia_clave', '');
  if (!apiKey) throw new Error('Configura tu clave de API de Claude en Finanzas → Importar / Exportar → Lectura con IA.');
  sdk ||= (await import('../../vendor/anthropic-sdk.mjs')).default;
  // Uso personal: la clave vive solo en este navegador. Recomendado: una clave con límite de gasto.
  return { Anthropic: sdk, client: new sdk({ apiKey, dangerouslyAllowBrowser: true }) };
}

const aBase64 = (blob) => new Promise((ok, mal) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(',')[1]);
  r.onerror = () => mal(r.error);
  r.readAsDataURL(blob);
});

// Reduce fotos grandes y convierte formatos no soportados (p. ej. HEIC si el navegador lo decodifica) a JPEG.
export async function prepararImagen(blob) {
  if (blob.type === 'application/pdf') return blob;
  let bmp;
  try { bmp = await createImageBitmap(blob); } catch { return blob; }
  const escala = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height));
  if (escala === 1 && TIPOS_IMAGEN.includes(blob.type) && blob.size < 3_500_000) return blob;
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * escala), height: Math.round(bmp.height * escala) });
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((ok) => canvas.toBlob((b) => ok(b || blob), 'image/jpeg', 0.85));
}

function esquema(rubros) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['tipo', 'fecha', 'total', 'moneda', 'comercio', 'nit', 'descripcion', 'rubro', 'medio_pago', 'retencion', 'confianza', 'observaciones'],
    properties: {
      tipo: { type: 'string', enum: ['gasto', 'ingreso', 'transferencia', 'no_es_soporte'] },
      fecha: { type: 'string', description: 'AAAA-MM-DD, o cadena vacía si no aparece' },
      total: { type: 'number', description: 'Valor total pagado o recibido, en unidades de la moneda (sin separadores). 0 si no se lee.' },
      moneda: { type: 'string', description: 'Código ISO, normalmente COP' },
      comercio: { type: 'string', description: 'Comercio, empresa o persona que cobra o paga' },
      nit: { type: 'string', description: 'NIT o cédula del tercero si aparece, si no cadena vacía' },
      descripcion: { type: 'string', description: 'Descripción breve en español (máx. 60 caracteres)' },
      rubro: { type: 'string', enum: rubros, description: 'Cuenta contable más adecuada de la lista' },
      medio_pago: { type: 'string', enum: ['efectivo', 'tarjeta_credito', 'tarjeta_debito', 'transferencia', 'desconocido'] },
      retencion: { type: 'number', description: 'Retención en la fuente descontada, si el soporte la muestra; si no, 0' },
      confianza: { type: 'string', enum: ['alta', 'media', 'baja'] },
      observaciones: { type: 'string', description: 'Dudas o datos ilegibles; cadena vacía si todo es claro' },
    },
  };
}

const SISTEMA = `Eres el asistente contable de una persona natural en Colombia (docente universitario y consultor independiente).
Recibes fotos de soportes: facturas y tiquetes POS, facturas electrónicas DIAN, recibos de servicios públicos, comprobantes de transferencia (Nequi, Daviplata, Bancolombia, PSE), cuentas de cobro y extractos.
Extrae los datos del soporte y clasifícalo en uno de los rubros dados.
- "gasto": la persona paga. "ingreso": la persona recibe dinero (nómina, honorarios, pagos de clientes). "transferencia": movimiento entre cuentas propias o pago de tarjeta de crédito.
- Valores en formato colombiano: "$ 1.234.567,89" significa 1234567.89. Un punto seguido de tres dígitos separa miles.
- Usa el total final (después de impuestos y propinas). Si hay varios valores, el total a pagar.
- Si la imagen no es un soporte de pago o ingreso, usa tipo "no_es_soporte".
- Respeta las preferencias del usuario: si el comercio aparece en su historial, usa el mismo rubro salvo evidencia clara en contra.
- No inventes datos: si algo no se lee, déjalo vacío o en 0 y explícalo en observaciones.`;

// Devuelve los datos extraídos + uso de tokens. Lanza Error con mensaje entendible en español.
export async function leerSoporte(blob, { cuentas, historial = [] }) {
  const { Anthropic, client } = await cliente();
  const preparado = await prepararImagen(blob);
  const datos = await aBase64(preparado);
  const rubros = cuentas.filter((c) => c.activa && ['gasto', 'ingreso'].includes(c.tipo));
  const bloque = preparado.type === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: datos } }
    : { type: 'image', source: { type: 'base64', media_type: TIPOS_IMAGEN.includes(preparado.type) ? preparado.type : 'image/jpeg', data: datos } };
  const contexto = [
    'Rubros disponibles (id: nombre):',
    ...rubros.map((c) => `- ${c.id}: ${c.nombre} (${c.tipo})`),
    historial.length ? `\nHistorial del usuario (comercio → rubro):\n${historial.map((h) => `- ${h.tercero} → ${h.cuenta}`).join('\n')}` : '',
    `\nFecha de hoy: ${new Date().toISOString().slice(0, 10)}. Extrae los datos de este soporte.`,
  ].join('\n');

  let respuesta;
  try {
    respuesta = await client.beta.messages.create({
      model: MODELO,
      max_tokens: 4096,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SISTEMA,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: esquema(rubros.map((c) => c.id)) } },
      messages: [{ role: 'user', content: [bloque, { type: 'text', text: contexto }] }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error('La clave de API no es válida. Revísala en Lectura con IA.');
    if (e instanceof Anthropic.PermissionDeniedError) throw new Error('La clave no tiene permiso para este modelo o la cuenta no tiene saldo.');
    if (e instanceof Anthropic.RateLimitError) throw new Error('Demasiadas solicitudes seguidas. Intenta de nuevo en un minuto.');
    if (e instanceof Anthropic.BadRequestError) throw new Error(`La API rechazó la solicitud: ${e.message}`);
    if (e instanceof Anthropic.APIConnectionError) throw new Error('Sin conexión con la API de Claude. Revisa tu internet.');
    if (e instanceof Anthropic.APIError) throw new Error(`Error de la API (${e.status ?? '?'}): ${e.message}`);
    throw e;
  }
  if (respuesta.stop_reason === 'refusal') throw new Error('El modelo no pudo procesar esta imagen. Regístrala manualmente.');
  if (respuesta.stop_reason === 'max_tokens') throw new Error('La respuesta quedó incompleta. Intenta de nuevo.');
  const texto = respuesta.content.find((b) => b.type === 'text')?.text;
  if (!texto) throw new Error('La respuesta no trajo datos.');
  let resultado;
  try { resultado = JSON.parse(texto); } catch { throw new Error('No se pudo interpretar la respuesta del modelo.'); }
  return { ...resultado, uso: respuesta.usage, modelo: respuesta.model };
}

// Prueba rápida de la clave (petición mínima).
export async function probarClave() {
  const { client } = await cliente();
  const r = await client.messages.create({ model: MODELO, max_tokens: 64, output_config: { effort: 'low' }, messages: [{ role: 'user', content: 'Responde solo: OK' }] });
  return r.content.some((b) => b.type === 'text');
}
