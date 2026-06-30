// server.js — Backend de Olimpo Control 1.0
// Capa visual/pedagógica sobre datos de inventario tipo Loyverse.
// Stack: Express + lowdb (archivo JSON). Cero servicios externos requeridos
// para correr local; pensado para desplegar en Render/Railway/Fly/VPS con
// "npm install && npm start" y nada más.

const express = require("express");
const cors = require("cors");
const QRCode = require("qrcode");
const path = require("path");
const { randomUUID } = require("crypto");
const db = require("./db");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const ZONA = "America/Guayaquil"; // Ecuador, UTC-5, sin horario de verano

// ---------- Helpers de fecha ----------
function hoyISO() {
  // YYYY-MM-DD en hora de Ecuador, sin depender de la TZ del servidor
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return f.format(new Date()); // en-CA -> YYYY-MM-DD
}

function esDeHoy(fechaISO) {
  if (!fechaISO) return false;
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date(fechaISO));
  return f === hoyISO();
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

function nombreUbicacion(ubicacionId) {
  const u = db.get("ubicaciones").find({ id: ubicacionId }).value();
  return u ? u.nombre : "Ubicación desconocida";
}

function toResumenInventario(p) {
  const { estado, mensaje } = calcularEstado(p);
  return {
    id: p.id,
    nombre: p.nombre,
    categoria: p.categoria,
    sku: p.sku,
    stockActual: p.stockActual,
    estado,
    mensaje,
  };
}

function toFicha(p) {
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
    ubicacionNombre: nombreUbicacion(p.ubicacionId),
  };
}

const ORDEN_ESTADO = { rojo: 0, amarillo: 1, azul: 2, verde: 3 };

function productosFiltrados(ubicacionId) {
  let lista = db.get("productos").value();
  if (ubicacionId && ubicacionId !== "todas") {
    lista = lista.filter((p) => p.ubicacionId === ubicacionId);
  }
  return lista;
}

function registrarMovimiento(tipo, detalle) {
  db.get("movimientos")
    .push({ id: randomUUID(), tipo, detalle, fecha: new Date().toISOString() })
    .write();
}

// ====================== RUTAS ======================

// --- Ubicaciones ---
app.get("/api/ubicaciones", (req, res) => {
  res.json(db.get("ubicaciones").value());
});

// --- Dashboard (vista Hoy) ---
app.get("/api/dashboard", (req, res) => {
  const { ubicacionId } = req.query;
  const productos = productosFiltrados(ubicacionId);
  const ventasHoy = db
    .get("ventas")
    .value()
    .filter((v) => esDeHoy(v.fecha) && (!ubicacionId || ubicacionId === "todas" || v.ubicacionId === ubicacionId));

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
});

// --- Inventario ---
app.get("/api/productos", (req, res) => {
  const { ubicacionId, estado } = req.query;
  let productos = productosFiltrados(ubicacionId).map((p) => ({ p, resumen: toResumenInventario(p) }));

  if (estado) {
    productos = productos.filter((x) => x.resumen.estado === estado);
  }

  productos.sort((a, b) => {
    const diff = ORDEN_ESTADO[a.resumen.estado] - ORDEN_ESTADO[b.resumen.estado];
    if (diff !== 0) return diff;
    return a.resumen.nombre.localeCompare(b.resumen.nombre, "es");
  });

  res.json(productos.map((x) => x.resumen));
});

app.get("/api/productos/:id", (req, res) => {
  const p = db.get("productos").find({ id: req.params.id }).value();
  if (!p) return res.status(404).json({ error: "Producto no encontrado." });
  res.json(toFicha(p));
});

// --- Escanear ---
app.post("/api/escanear", (req, res) => {
  const codigo = String(req.body.codigo || "").trim().toLowerCase();
  if (!codigo) return res.status(400).json({ error: "Código vacío." });

  const p = db
    .get("productos")
    .find(
      (x) =>
        String(x.barcode).toLowerCase() === codigo || String(x.sku).toLowerCase() === codigo
    )
    .value();

  if (!p) return res.status(404).json({ error: "No se encontró ningún producto con ese código." });
  res.json(toFicha(p));
});

// --- Venta rápida ---
app.post("/api/productos/:id/venta", (req, res) => {
  const p = db.get("productos").find({ id: req.params.id }).value();
  if (!p) return res.status(404).json({ error: "Producto no encontrado." });

  const cantidad = Number.isInteger(req.body.cantidad) && req.body.cantidad > 0 ? req.body.cantidad : 1;

  if (p.stockActual < cantidad) {
    return res.status(400).json({ error: `No hay suficiente stock disponible (quedan ${p.stockActual}).` });
  }

  db.get("productos").find({ id: p.id }).assign({ stockActual: p.stockActual - cantidad }).write();

  db.get("ventas")
    .push({
      id: randomUUID(),
      productoId: p.id,
      ubicacionId: p.ubicacionId,
      cantidad,
      precioUnit: p.precio,
      costoUnit: p.costo,
      fecha: new Date().toISOString(),
    })
    .write();

  registrarMovimiento("venta", {
    producto: p.nombre,
    cantidad,
    total: Number((p.precio * cantidad).toFixed(2)),
    ubicacion: nombreUbicacion(p.ubicacionId),
  });

  const actualizado = db.get("productos").find({ id: p.id }).value();
  res.json({ producto: toFicha(actualizado) });
});

// --- Ajuste manual de stock ---
app.post("/api/productos/:id/ajustar", (req, res) => {
  const p = db.get("productos").find({ id: req.params.id }).value();
  if (!p) return res.status(404).json({ error: "Producto no encontrado." });

  const delta = Number.isInteger(req.body.delta) ? req.body.delta : 0;
  const motivo = req.body.motivo || "Ajuste manual";
  const nuevoStock = p.stockActual + delta;

  if (nuevoStock < 0) {
    return res.status(400).json({ error: `Ese ajuste dejaría el stock en negativo (actual: ${p.stockActual}).` });
  }

  db.get("productos").find({ id: p.id }).assign({ stockActual: nuevoStock }).write();

  registrarMovimiento("ajuste", {
    producto: p.nombre,
    delta,
    motivo,
    stockResultante: nuevoStock,
    ubicacion: nombreUbicacion(p.ubicacionId),
  });

  const actualizado = db.get("productos").find({ id: p.id }).value();
  res.json(toFicha(actualizado));
});

// --- Etiqueta con QR ---
app.get("/api/productos/:id/etiqueta", async (req, res) => {
  const p = db.get("productos").find({ id: req.params.id }).value();
  if (!p) return res.status(404).json({ error: "Producto no encontrado." });

  try {
    const payload = JSON.stringify({ id: p.id, sku: p.sku, barcode: p.barcode });
    const qrDataUrl = await QRCode.toDataURL(payload, { margin: 1, width: 320 });
    res.json({ producto: toFicha(p), qrDataUrl });
  } catch (err) {
    res.status(500).json({ error: "No se pudo generar el código QR." });
  }
});

// --- Actividad reciente ---
app.get("/api/actividad", (req, res) => {
  const items = db.get("movimientos").value().slice().reverse().slice(0, 100);
  res.json(items);
});

// --- Configuración: gastos mensuales (simplificado, un número por ubicación) ---
app.get("/api/configuracion/gastos", (req, res) => {
  const { ubicacionId } = req.query;
  const gastos = db.get("configuracion.gastosMensuales").value() || {};

  if (!ubicacionId || ubicacionId === "todas") {
    const total = Object.values(gastos).reduce((acc, v) => acc + Number(v || 0), 0);
    return res.json({ ubicacionId: "todas", gastosMensuales: Number(total.toFixed(2)), porUbicacion: gastos });
  }

  res.json({ ubicacionId, gastosMensuales: Number(gastos[ubicacionId] || 0) });
});

app.post("/api/configuracion/gastos", (req, res) => {
  const { ubicacionId, gastosMensuales } = req.body;
  const monto = Number(gastosMensuales);

  if (!ubicacionId || ubicacionId === "todas") {
    return res.status(400).json({ error: "Elige una ubicación específica para guardar sus gastos mensuales." });
  }
  if (!Number.isFinite(monto) || monto < 0) {
    return res.status(400).json({ error: "El monto de gastos mensuales debe ser un número igual o mayor a 0." });
  }
  if (!db.get("ubicaciones").find({ id: ubicacionId }).value()) {
    return res.status(404).json({ error: "Ubicación no encontrada." });
  }

  db.set(`configuracion.gastosMensuales.${ubicacionId}`, Number(monto.toFixed(2))).write();
  res.json({ ubicacionId, gastosMensuales: Number(monto.toFixed(2)) });
});

// --- Reportes (modo avanzado) ---
app.get("/api/reportes/pl", (req, res) => {
  const { ubicacionId } = req.query;
  const ventasHoy = db
    .get("ventas")
    .value()
    .filter((v) => esDeHoy(v.fecha) && (!ubicacionId || ubicacionId === "todas" || v.ubicacionId === ubicacionId));

  const ingresos = ventasHoy.reduce((acc, v) => acc + v.precioUnit * v.cantidad, 0);
  const costoVentas = ventasHoy.reduce((acc, v) => acc + v.costoUnit * v.cantidad, 0);
  const utilidadBruta = ingresos - costoVentas;

  const gastos = db.get("configuracion.gastosMensuales").value() || {};
  let gastosMensuales = 0;
  if (!ubicacionId || ubicacionId === "todas") {
    gastosMensuales = Object.values(gastos).reduce((acc, v) => acc + Number(v || 0), 0);
  } else {
    gastosMensuales = Number(gastos[ubicacionId] || 0);
  }
  const gastosOperativos = Number((gastosMensuales / 30).toFixed(2)); // prorrateo diario simple

  const utilidadNeta = utilidadBruta - gastosOperativos;

  res.json({
    ingresos: Number(ingresos.toFixed(2)),
    costoVentas: Number(costoVentas.toFixed(2)),
    utilidadBruta: Number(utilidadBruta.toFixed(2)),
    gastosOperativos,
    utilidadNeta: Number(utilidadNeta.toFixed(2)),
  });
});

app.get("/api/reportes/balance", (req, res) => {
  const { ubicacionId } = req.query;
  const productos = productosFiltrados(ubicacionId);
  const ventasHoy = db
    .get("ventas")
    .value()
    .filter((v) => esDeHoy(v.fecha) && (!ubicacionId || ubicacionId === "todas" || v.ubicacionId === ubicacionId));

  const efectivoEstimado = ventasHoy.reduce((acc, v) => acc + v.precioUnit * v.cantidad, 0);
  const inventarioValorizado = productos.reduce((acc, p) => acc + p.precio * p.stockActual, 0);

  res.json({
    activos: {
      efectivoEstimado: Number(efectivoEstimado.toFixed(2)),
      inventarioValorizado: Number(inventarioValorizado.toFixed(2)),
      total: Number((efectivoEstimado + inventarioValorizado).toFixed(2)),
    },
  });
});

app.get("/api/reportes/valorizado", (req, res) => {
  const { ubicacionId } = req.query;
  const productos = productosFiltrados(ubicacionId);

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
});

// --- Fallback: cualquier ruta no-API sirve el frontend ---
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Olimpo Control 1.0 escuchando en http://localhost:${PORT}`);
});
