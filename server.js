// server.js — Backend de Olimpo Control 1.0
// Capa visual/pedagógica sobre Loyverse (o datos de demo si no hay token).
// Stack: Express + data.js (adaptador Loyverse/demo). "npm install && npm start"
// y nada más para correr local o desplegar en Render/Railway/Fly/VPS.

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const QRCode = require("qrcode");
const path = require("path");
const data = require("./data");
const umbrales = require("./umbrales");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const ZONA = "America/Guayaquil"; // Ecuador, UTC-5, sin horario de verano

// ---------- Helpers de fecha ----------
function hoyISO() {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return f.format(new Date()); // en-CA -> YYYY-MM-DD
}

// ---------- Helpers de negocio ----------
function calcularEstado(p) {
  const margen = p.precio > 0 ? (p.precio - p.costo) / p.precio : 0;

  if (p.stockActual <= 0) {
    return { estado: "rojo", mensaje: "Sin stock — repón cuanto antes" };
  }
  if (p.stockActual <= p.umbralRojo) {
    return { estado: "rojo", mensaje: `Quedan ${p.stockActual} — reponer urgente` };
  }
  if (p.stockActual <= p.umbralAmarillo) {
    return { estado: "amarillo", mensaje: `Quedan ${p.stockActual} — revisar pronto` };
  }
  if (margen >= 0.5) {
    return { estado: "azul", mensaje: "Buen margen — impúlsalo esta semana" };
  }
  return { estado: "verde", mensaje: "Stock saludable" };
}

function toResumenInventario(p) {
  const { estado, mensaje } = calcularEstado(p);
  return { id: p.id, nombre: p.nombre, categoria: p.categoria, sku: p.sku, stockActual: p.stockActual, estado, mensaje };
}

async function toFicha(p) {
  const { estado, mensaje } = calcularEstado(p);
  return {
    id: p.id,
    nombre: p.nombre,
    precio: p.precio,
    sku: p.sku,
    barcode: p.barcode,
    proveedor: p.proveedor,
    stockActual: p.stockActual,
    estado,
    mensaje,
    categoria: p.categoria,
    ubicacionId: p.ubicacionId,
    ubicacionNombre: await data.nombreUbicacion(p.ubicacionId),
  };
}

const ORDEN_ESTADO = { rojo: 0, amarillo: 1, azul: 2, verde: 3 };

function asyncRoute(fn) {
  return (req, res) => fn(req, res).catch((err) => {
    console.error(err);
    res.status(502).json({ error: "No se pudo obtener datos de Loyverse. Verifica el token y vuelve a intentar." });
  });
}

// ====================== RUTAS ======================

app.get("/api/modo", (req, res) => {
  res.json({ modo: data.modo });
});

// --- Ubicaciones ---
app.get("/api/ubicaciones", asyncRoute(async (req, res) => {
  res.json(await data.getUbicaciones());
}));

// --- Dashboard (vista Hoy) ---
app.get("/api/dashboard", asyncRoute(async (req, res) => {
  const { ubicacionId } = req.query;
  const productos = await data.getProductos(ubicacionId);
  const ventasHoy = await data.getVentasHoy(ubicacionId, hoyISO());

  const entra = ventasHoy.reduce((acc, v) => acc + v.precioUnit * v.cantidad, 0);
  const sale = ventasHoy.reduce((acc, v) => acc + v.costoUnit * v.cantidad, 0);
  const gananciaHoy = entra - sale;

  const inventarioValorizado = productos.reduce((acc, p) => acc + p.precio * p.stockActual, 0);

  const evaluados = productos.map((p) => ({ p, ...calcularEstado(p) }));
  const alertas = evaluados
    .filter((e) => e.estado === "rojo" || e.estado === "amarillo")
    .sort((a, b) => ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado])
    .map((e) => ({ estado: e.estado, mensaje: `${e.p.nombre}: ${e.mensaje}` }));

  let semaforoGeneral = "verde";
  if (alertas.some((a) => a.estado === "rojo")) semaforoGeneral = "rojo";
  else if (alertas.some((a) => a.estado === "amarillo")) semaforoGeneral = "amarillo";

  res.json({
    semaforoGeneral,
    resumenDia: {
      entra: Number(entra.toFixed(2)),
      sale: Number(sale.toFixed(2)),
      gananciaHoy: Number(gananciaHoy.toFixed(2)),
      inventarioValorizado: Number(inventarioValorizado.toFixed(2)),
      ventasCount: ventasHoy.length,
    },
    alertas,
  });
}));

// --- Inventario ---
app.get("/api/productos", asyncRoute(async (req, res) => {
  const { ubicacionId, estado } = req.query;
  let productos = (await data.getProductos(ubicacionId)).map((p) => ({ p, resumen: toResumenInventario(p) }));

  if (estado) productos = productos.filter((x) => x.resumen.estado === estado);

  productos.sort((a, b) => {
    const diff = ORDEN_ESTADO[a.resumen.estado] - ORDEN_ESTADO[b.resumen.estado];
    if (diff !== 0) return diff;
    return a.resumen.nombre.localeCompare(b.resumen.nombre, "es");
  });

  res.json(productos.map((x) => x.resumen));
}));

app.get("/api/productos/:id", asyncRoute(async (req, res) => {
  const p = await data.getProducto(req.params.id);
  if (!p) return res.status(404).json({ error: "Producto no encontrado." });
  res.json(await toFicha(p));
}));

// --- Umbrales (puntos de reorden, editables por José/admin) ---
app.post("/api/productos/:id/umbrales", asyncRoute(async (req, res) => {
  const p = await data.getProducto(req.params.id);
  if (!p) return res.status(404).json({ error: "Producto no encontrado." });
  const variantId = p.variantId || p.id;
  umbrales.set(variantId, { umbralRojo: req.body.umbralRojo, umbralAmarillo: req.body.umbralAmarillo });
  res.json({ ok: true });
}));

// --- Escanear ---
app.post("/api/escanear", asyncRoute(async (req, res) => {
  const codigo = String(req.body.codigo || "").trim();
  if (!codigo) return res.status(400).json({ error: "Código vacío." });

  const p = await data.buscarPorCodigo(codigo);
  if (!p) return res.status(404).json({ error: "No se encontró ningún producto con ese código." });
  res.json(await toFicha(p));
}));

// --- Venta rápida ---
app.post("/api/productos/:id/venta", asyncRoute(async (req, res) => {
  const cantidad = Number.isInteger(req.body.cantidad) && req.body.cantidad > 0 ? req.body.cantidad : 1;
  const r = await data.venderUno(req.params.id, cantidad);
  if (r.error) return res.status(400).json({ error: r.error });
  res.json({ producto: await toFicha(r.producto) });
}));

// --- Ajuste manual de stock ---
app.post("/api/productos/:id/ajustar", asyncRoute(async (req, res) => {
  const delta = Number.isInteger(req.body.delta) ? req.body.delta : 0;
  const motivo = req.body.motivo || "Ajuste manual";
  const r = await data.ajustar(req.params.id, delta, motivo);
  if (r.error) return res.status(400).json({ error: r.error });
  res.json(await toFicha(r.producto));
}));

// --- Etiqueta con QR ---
app.get("/api/productos/:id/etiqueta", asyncRoute(async (req, res) => {
  const p = await data.getProducto(req.params.id);
  if (!p) return res.status(404).json({ error: "Producto no encontrado." });

  try {
    const payload = JSON.stringify({ id: p.id, sku: p.sku, barcode: p.barcode });
    const qrDataUrl = await QRCode.toDataURL(payload, { margin: 1, width: 320 });
    res.json({ producto: await toFicha(p), qrDataUrl });
  } catch (err) {
    res.status(500).json({ error: "No se pudo generar el código QR." });
  }
}));

// --- Actividad reciente (siempre local: acciones hechas desde Olimpo Control) ---
app.get("/api/actividad", (req, res) => {
  res.json(data.getActividad());
});

// --- Configuración: gastos mensuales (siempre local, sin importar el modo) ---
app.get("/api/configuracion/gastos", (req, res) => {
  res.json(data.getGastosMensuales(req.query.ubicacionId));
});

app.post("/api/configuracion/gastos", asyncRoute(async (req, res) => {
  const { ubicacionId, gastosMensuales } = req.body;
  const monto = Number(gastosMensuales);

  if (!ubicacionId || ubicacionId === "todas") {
    return res.status(400).json({ error: "Elige una ubicación específica para guardar sus gastos mensuales." });
  }
  if (!Number.isFinite(monto) || monto < 0) {
    return res.status(400).json({ error: "El monto de gastos mensuales debe ser un número igual o mayor a 0." });
  }
  const ubicaciones = await data.getUbicaciones();
  if (!ubicaciones.find((u) => u.id === ubicacionId)) {
    return res.status(404).json({ error: "Ubicación no encontrada." });
  }

  data.setGastosMensuales(ubicacionId, monto);
  res.json({ ubicacionId, gastosMensuales: Number(monto.toFixed(2)) });
}));

// --- Reportes (modo avanzado) ---
app.get("/api/reportes/pl", asyncRoute(async (req, res) => {
  const { ubicacionId } = req.query;
  const ventasHoy = await data.getVentasHoy(ubicacionId, hoyISO());

  const ingresos = ventasHoy.reduce((acc, v) => acc + v.precioUnit * v.cantidad, 0);
  const costoVentas = ventasHoy.reduce((acc, v) => acc + v.costoUnit * v.cantidad, 0);
  const utilidadBruta = ingresos - costoVentas;

  const { gastosMensuales } = data.getGastosMensuales(ubicacionId);
  const gastosOperativos = Number((gastosMensuales / 30).toFixed(2));
  const utilidadNeta = utilidadBruta - gastosOperativos;

  res.json({
    ingresos: Number(ingresos.toFixed(2)),
    costoVentas: Number(costoVentas.toFixed(2)),
    utilidadBruta: Number(utilidadBruta.toFixed(2)),
    gastosOperativos,
    utilidadNeta: Number(utilidadNeta.toFixed(2)),
  });
}));

app.get("/api/reportes/balance", asyncRoute(async (req, res) => {
  const { ubicacionId } = req.query;
  const productos = await data.getProductos(ubicacionId);
  const ventasHoy = await data.getVentasHoy(ubicacionId, hoyISO());

  const efectivoEstimado = ventasHoy.reduce((acc, v) => acc + v.precioUnit * v.cantidad, 0);
  const inventarioValorizado = productos.reduce((acc, p) => acc + p.precio * p.stockActual, 0);

  res.json({
    activos: {
      efectivoEstimado: Number(efectivoEstimado.toFixed(2)),
      inventarioValorizado: Number(inventarioValorizado.toFixed(2)),
      total: Number((efectivoEstimado + inventarioValorizado).toFixed(2)),
    },
  });
}));

app.get("/api/reportes/valorizado", asyncRoute(async (req, res) => {
  const { ubicacionId } = req.query;
  const productos = await data.getProductos(ubicacionId);

  const filas = productos.map((p) => {
    const valorCosto = p.costo * p.stockActual;
    const valorVenta = p.precio * p.stockActual;
    return {
      nombre: p.nombre,
      stockActual: p.stockActual,
      valorCosto: Number(valorCosto.toFixed(2)),
      valorVenta: Number(valorVenta.toFixed(2)),
      utilidadPotencial: Number((valorVenta - valorCosto).toFixed(2)),
    };
  });

  const totales = filas.reduce(
    (acc, f) => ({
      valorCosto: acc.valorCosto + f.valorCosto,
      valorVenta: acc.valorVenta + f.valorVenta,
      utilidadPotencial: acc.utilidadPotencial + f.utilidadPotencial,
    }),
    { valorCosto: 0, valorVenta: 0, utilidadPotencial: 0 }
  );

  res.json({
    productos: filas,
    totales: {
      valorCosto: Number(totales.valorCosto.toFixed(2)),
      valorVenta: Number(totales.valorVenta.toFixed(2)),
      utilidadPotencial: Number(totales.utilidadPotencial.toFixed(2)),
    },
  });
}));

// --- Fallback: cualquier ruta no-API sirve el frontend ---
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Olimpo Control 1.0 escuchando en http://localhost:${PORT} — modo: ${data.modo}`);
});
