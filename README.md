# Olimpo Control 1.0 — Backend

Backend Express + lowdb que implementa exactamente el contrato de API que
consume `public/index.html`. Cero infraestructura nueva: un solo proceso
Node, un archivo `data/db.json` como base de datos.

## Correr local

```bash
npm install
npm start
```

Abre `http://localhost:3000` — el frontend se sirve desde `/public` y
consume `/api/...` en el mismo origen (sin CORS que configurar en local).

## Desplegar (Render / Railway / Fly / cualquier VPS)

1. Sube esta carpeta a un repo de GitHub.
2. En Render/Railway: "New Web Service" → conecta el repo.
   - Build command: `npm install`
   - Start command: `npm start`
   - No necesitas variables de entorno; usa `process.env.PORT` automáticamente.
3. **Importante sobre persistencia:** `data/db.json` vive en el disco del
   contenedor. En Render/Railway gratis el disco puede ser efímero (se borra
   en cada redeploy). Para producción real:
   - Activa un "Persistent Disk" / volumen montado en `data/` (Render lo
     ofrece en planes pagos), o
   - Cuando crezca, migra `db.js` a Postgres — la lógica de negocio en
     `server.js` no cambia, solo cambiarías las llamadas a `db.get(...)`.

## Contrato de API (resumen)

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/ubicaciones` | selector de tienda |
| GET | `/api/dashboard?ubicacionId=` | vista "Hoy" |
| GET | `/api/productos?ubicacionId=&estado=` | vista "Inventario" |
| GET | `/api/productos/:id` | ficha de producto |
| POST | `/api/escanear` `{codigo}` | vista "Escanear" |
| POST | `/api/productos/:id/venta` `{cantidad}` | vender |
| POST | `/api/productos/:id/ajustar` `{delta,motivo}` | +1/-1 stock |
| GET | `/api/productos/:id/etiqueta` | etiqueta + QR |
| GET | `/api/actividad` | log de ventas/ajustes |
| GET | `/api/reportes/pl?ubicacionId=` | P&L del día |
| GET | `/api/reportes/balance?ubicacionId=` | balance simplificado |
| GET | `/api/reportes/valorizado?ubicacionId=` | inventario valorizado |

## Reglas de negocio implementadas

- **Semáforo por producto:** rojo si `stockActual <= umbralRojo` (o 0),
  amarillo si `<= umbralAmarillo`, azul si está sano y el margen
  `(precio-costo)/precio >= 50%` (oportunidad de impulso), verde en el resto.
- **"Hoy"** se calcula en zona horaria `America/Guayaquil`, no en la del
  servidor — así no se desfasa si despliegas en EE.UU. o Europa.
- **Gastos operativos** están en 0 porque todavía no hay módulo de gastos;
  el campo ya existe en el P&L para cuando lo agregues.

## Siguiente paso natural

Cuando quieras reemplazar los datos semilla por los reales de Loyverse,
solo necesitas un script que llene `data/db.json` (o una tabla Postgres)
leyendo la API de Loyverse — toda la capa visual y de reportes de arriba
sigue funcionando igual porque no le importa de dónde vino el dato.
