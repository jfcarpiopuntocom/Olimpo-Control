# Olimpo Control 1.0 — Backend

Backend Express que envuelve Loyverse con una capa visual/pedagógica. Cero
infraestructura nueva: un solo proceso Node.

## Para Jose: activar tu cuenta real de Loyverse (3 pasos)

1. Entra al Back Office de Loyverse: https://r.loyverse.com → **Settings → Access Tokens**
2. Click **"+ Add access token"**, ponle nombre "Olimpo Control" y guarda.
   Copia el token apenas aparezca — **solo se muestra una vez**.
3. Pega ese token donde te indique quien despliegue esto (variable de entorno
   `LOYVERSE_TOKEN`). Nada más — Olimpo Control empieza a mostrar tus tiendas,
   productos y ventas reales automáticamente.

Sin token configurado, el sistema corre en **modo demo** con datos de ejemplo
(útil para seguir desarrollando o mostrar la idea sin tocar tu cuenta real).

## Correr local

```bash
npm install
cp .env.example .env   # pega tu LOYVERSE_TOKEN ahí (o déjalo vacío para modo demo)
npm start
```

Abre `http://localhost:3000`. El pie de la consola te dice en qué modo
arrancó: `modo: loyverse` o `modo: demo`.

## Desplegar (Render / Railway / Fly / cualquier VPS)

1. Sube esta carpeta a un repo de GitHub (ya está en
   `github.com/jfcarpiopuntocom/Olimpo-Control`).
2. En Render/Railway: "New Web Service" → conecta el repo.
   - Build command: `npm install`
   - Start command: `npm start`
   - Variable de entorno: `LOYVERSE_TOKEN` = el token de Jose (en el panel del
     hosting, **nunca** en el código ni en `.env` subido a GitHub).
3. Listo. No hay base de datos que migrar ni disco persistente que configurar
   para el catálogo/inventario/ventas — todo eso vive en Loyverse. Lo único
   que Olimpo Control guarda localmente son los **umbrales de alerta**
   (`data/umbrales.json`) y los **gastos mensuales** (`data/db.json`), que sí
   conviene respaldar o mover a un disco persistente si el hosting lo permite.

## Cómo se reparte el trabajo entre Loyverse y Olimpo Control

- **Loyverse es la única fuente de verdad para catálogo, inventario y
  ventas.** Olimpo Control nunca inventa una venta ni crea un recibo —
  eso sigue pasando en la caja real de Loyverse (POS o back office).
- **"Vender 1" / "+1 / -1 stock"** desde Olimpo Control ajustan el inventario
  de Loyverse directamente (vía `POST /v1.0/inventory`), para corregir stock
  rápido sin abrir el back office completo. No generan un recibo de venta.
- **El dashboard, P&L y balance** se calculan leyendo los recibos reales de
  Loyverse del día (`GET /v1.0/receipts`) — son números reales, no estimados.
- **Los umbrales rojo/amarillo** (cuándo alertar) son de Olimpo Control, no de
  Loyverse, porque Loyverse no expone puntos de reorden de forma consistente
  entre planes. Se editan por producto y quedan guardados localmente.

## Contrato de API (resumen)

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/modo` | `"loyverse"` o `"demo"` |
| GET | `/api/ubicaciones` | selector de tienda (tiendas reales de Loyverse) |
| GET | `/api/dashboard?ubicacionId=` | vista "Hoy" |
| GET | `/api/productos?ubicacionId=&estado=` | vista "Inventario" |
| GET | `/api/productos/:id` | ficha de producto |
| POST | `/api/productos/:id/umbrales` `{umbralRojo,umbralAmarillo}` | editar puntos de alerta |
| POST | `/api/escanear` `{codigo}` | vista "Escanear" |
| POST | `/api/productos/:id/venta` `{cantidad}` | ajusta stock en Loyverse |
| POST | `/api/productos/:id/ajustar` `{delta,motivo}` | ajusta stock en Loyverse |
| GET | `/api/productos/:id/etiqueta` | etiqueta + QR |
| GET | `/api/actividad` | log local de acciones hechas desde Olimpo Control |
| GET | `/api/reportes/pl?ubicacionId=` | P&L del día (de recibos reales) |
| GET | `/api/reportes/balance?ubicacionId=` | balance simplificado |
| GET | `/api/reportes/valorizado?ubicacionId=` | inventario valorizado |

## Reglas de negocio implementadas

- **Semáforo por producto:** rojo si `stockActual <= umbralRojo` (o 0),
  amarillo si `<= umbralAmarillo`, azul si está sano y el margen
  `(precio-costo)/precio >= 50%` (oportunidad de impulso), verde en el resto.
- **"Hoy"** se calcula en zona horaria `America/Guayaquil`, no en la del
  servidor — así no se desfasa si despliegas en EE.UU. o Europa.

## Antes de usarlo con la cuenta real de Jose — verificación pendiente

La integración está construida sobre la documentación pública conocida de la
API de Loyverse (`/v1.0/stores`, `/items`, `/inventory`, `/receipts`,
`/suppliers`), pero **no se ha probado todavía contra una cuenta real** — los
nombres exactos de algunos campos (variantes, proveedores) pueden variar
según el plan de Loyverse de Jose. La primera conexión real (`GET
/api/modo` debe responder `"loyverse"`, y `/api/ubicaciones` debe mostrar sus
tiendas reales) debe revisarse antes de operar con ella en producción.
