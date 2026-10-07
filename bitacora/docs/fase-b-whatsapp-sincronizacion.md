# Fase B: bot de WhatsApp, familia y contador

La Fase 1 funciona sin servidor: en Android compartes la foto desde WhatsApp hacia Bitácora, la IA la lee
y tú confirmas el rubro. La Fase B agrega lo que **sí requiere un servidor**:

1. **Bot de WhatsApp**: envías la foto a un número propio y el bot responde con el resumen y botones de rubro.
   Funciona también en iPhone y para tu pareja.
2. **Sincronización familiar**: tú y tu pareja ven y registran en el mismo libro desde dos teléfonos.
3. **Acceso de solo lectura para el contador**: un enlace privado con el libro, los soportes y las preguntas.

## Arquitectura propuesta (bajo costo, poco mantenimiento)

```
WhatsApp ──► Meta Cloud API ──webhook──► Cloudflare Worker ──► API de Claude (lectura del soporte)
                                              │
                                              ├── R2: fotos de soportes (cifradas)
                                              └── D1 (SQLite): bandeja y eventos de sincronización
                                                       ▲
                   Bitácora (PWA en cada teléfono) ────┘  sincroniza al abrir (cifrado de extremo a extremo)
```

- **Por qué Cloudflare Workers**: el plan gratuito cubre de sobra el volumen de una familia, no hay servidor que
  mantener y la clave de la API de Claude queda en el servidor (no en el teléfono).
- **Flujo del bot**:
  1. Llega la imagen y el Worker descarga el archivo desde Meta.
  2. Claude extrae los datos con el mismo esquema JSON que usa la app (`modules/finanzas/ia.js`).
  3. El bot responde: *"Pago de $187.450 en Droguería Cruz Verde (6-oct). ¿Rubro?"* con botones interactivos (Salud · Familia · Mamá · Otro).
  4. La respuesta queda en la bandeja del servidor; la app la descarga y la convierte en movimiento con su soporte.
- **Seguridad**:
  - Solo se aceptan mensajes de números autorizados (el tuyo y el de tu pareja).
  - Las fotos se borran del servidor cuando la app las descarga.
  - La sincronización cifra los datos en el teléfono con una frase de paso familiar, así que el servidor no puede leerlos (mismo enfoque que Actual Budget).
  - El enlace del contador es de solo lectura, expira y se puede revocar.

## Costos esperados
- **WhatsApp Cloud API**: las respuestas dentro de la ventana de servicio que abre tu mensaje son gratuitas.
  Solo se pagarían plantillas iniciadas por el bot (p. ej. recordatorios); en Colombia, las de utilidad cuestan
  aproximadamente US$0,0014 por mensaje.
- **API de Claude**: igual que en la Fase 1 (centavos de dólar por foto).
- **Cloudflare**: plan gratuito.

## Lo que necesitas preparar
1. Una cuenta de **Meta Business** y un **número de teléfono dedicado** para el bot (no puede ser tu número personal de WhatsApp).
2. Una cuenta de **Cloudflare** (gratuita).
3. La clave de la **API de Claude** (la misma de la Fase 1, o una nueva solo para el servidor).

## Fuentes
- [Precios de WhatsApp Business Platform (Meta)](https://developers.facebook.com/docs/whatsapp/pricing)
- [Guía de precios 2026 de la API de WhatsApp](https://www.spurnow.com/blogs/whatsapp-business-api-pricing-explained)
- [Web Share Target: solo Chrome/Android lo soporta](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
