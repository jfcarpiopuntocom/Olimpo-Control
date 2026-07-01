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
const { code128SVG } = require("./barcode");

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
// Días entre hoy (Ecuador) y una fecha "YYYY-MM-DD". Negativo = ya venció.
function diasParaVencer(fechaCaducidad) {
  if (!fechaCaducidad) return null;
  const hoy = new Date(hoyISO() + "T00:00:00");
  const venc = new Date(fechaCaducidad + "T00:00:00");
  return Math.round((venc - hoy) / 86400000);
}

// El estado combina DOS señales independientes: nivel de stock (como antes)
// y, si el producto es perecible, cercanía al vencimiento. Se toma la más
// severa de las dos (un producto con stock sano pero por vencer sigue siendo
// una alerta real). El campo `dias` viaja en la respuesta para que la UI
// pueda mostrar "vence en 3 días" sin recalcular fechas en el navegador.
function calcularEstado(p) {
  const margen = p.precio > 0 ? (p.precio - p.costo) / p.precio : 0;
  const dias = p.perecible ? diasParaVencer(p.fechaCaducidad) : null;

  let porStock;
  if (p.stockActual <= 0) porStock = { estado: "rojo", mensaje: "Sin stock — repón cuanto antes" };
  else if (p.stockActual <= p.umbralRojo) porStock = { estado: "rojo", mensaje: `Quedan ${p.stockActual} — reponer urgente` };
  else if (p.stockActual <= p.umbralAmarillo) porStock = { estado: "amarillo", mensaje: `Quedan ${p.stockActual} — revisar pronto` };
  else if (margen >= 0.5) porStock = { estado: "azul", mensaje: "Buen margen — impúlsalo esta semana" };
  else porStock = { estado: "verde", mensaje: "Stock saludable" };

  if (dias == null) return { ...porStock, dias };

  let porVencimiento = null;
  if (dias < 0) porVencimiento = { estado: "rojo", mensaje: `Venció hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? "" : "s"} — retíralo` };
  else if (dias <= 3) porVencimiento = { estado: "rojo", mensaje: `Vence en ${dias} día${dias === 1 ? "" : "s"} — véndelo ya` };
  else if (dias <= 7) porVencimiento = { estado: "amarillo", mensaje: `Vence en ${dias} días — véndelo primero` };

  if (!porVencimiento) return { ...porStock, dias };
  // La más severa de las dos gana (rojo > amarillo > azul > verde).
  const masGrave = ORDEN_ESTADO[porVencimiento.estado] <= ORDEN_ESTADO[porStock.estado] ? porVencimiento : porStock;
  return { ...masGrave, dias };
}

function toResumenInventario(p) {
  const { estado, mensaje, dias } = calcularEstado(p);
  return {
    id: p.id, nombre: p.nombre, categoria: p.categoria, sku: p.sku, stockActual: p.stockActual, estado, mensaje,
    perecible: !!p.perecible, fechaCaducidad: p.fechaCaducidad || null, diasParaVencer: dias,
  };
}

async function toFicha(p) {
  const { estado, mensaje, dias } = calcularEstado(p);
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
    perecible: !!p.perecible,
    fechaCaducidad: p.fechaCaducidad || null,
    diasParaVencer: dias,
    metodoCosteo: p.metodoCosteo || "FIFO",
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

// --- Dar de alta un producto nuevo (típicamente tras escanear un código que
// no existía). En modo Loyverse, data.crearProducto devuelve un error
// explicando que el alta se hace en Loyverse — ver nota en data.js.
app.post("/api/productos", asyncRoute(async (req, res) => {
  const { nombre, barcode } = req.body;
  if (!nombre || !barcode) return res.status(400).json({ error: "Falta el nombre o el código de barras." });
  if (req.body.perecible && !req.body.fechaCaducidad) {
    return res.status(400).json({ error: "Si el producto expira, indica su fecha de caducidad." });
  }
  const r = await data.crearProducto(req.body);
  if (r.error) return res.status(400).json({ error: r.error });
  res.json(await toFicha(r));
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

// --- Etiqueta con barcode + QR combinados ---
// Una sola etiqueta con AMBOS códigos: el barcode (Code128, escaneable por
// cualquier lector láser barato de tienda) y el QR (abre la ficha completa
// desde el celular: precio, stock, proveedor, vencimiento). Los dos se
// generan 100% localmente sin llamar a ningún servicio externo — ver
// barcode.js y la dependencia "qrcode" (ambos open source, sin costo, sin
// límite de uso ni de por vida).
app.get("/api/productos/:id/etiqueta", asyncRoute(async (req, res) => {
  const p = await data.getProducto(req.params.id);
  if (!p) return res.status(404).json({ error: "Producto no encontrado." });

  try {
    const payload = JSON.stringify({ id: p.id, sku: p.sku, barcode: p.barcode });
    const qrDataUrl = await QRCode.toDataURL(payload, { margin: 1, width: 320 });
    const barcodeSvg = code128SVG(p.barcode, { width: 300, height: 80 });
    res.json({ producto: await toFicha(p), qrDataUrl, barcodeSvg });
  } catch (err) {
    res.status(500).json({ error: "No se pudo generar la etiqueta (revisa que el código de barras use solo caracteres ASCII imprimibles)." });
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

  if (!ubicacionId) {
    return res.status(400).json({ error: "Falta la ubicación." });
  }
  if (!Number.isFinite(monto) || monto < 0) {
    return res.status(400).json({ error: "El monto de gastos mensuales debe ser un número igual o mayor a 0." });
  }
  // "todas" es válido aquí: el selector de ubicaciones está DORMANT en Olimpo
  // (ver index.html, comentario "UBICACIONES — DORMANT"), así que el negocio
  // opera como una sola tienda virtual bajo la clave "todas". Si se reactiva
  // el multi-ubicación, esta excepción sigue funcionando igual para clientes
  // de una sola tienda — no hace falta revertir nada aquí.
  if (ubicacionId !== "todas") {
    const ubicaciones = await data.getUbicaciones();
    if (!ubicaciones.find((u) => u.id === ubicacionId)) {
      return res.status(404).json({ error: "Ubicación no encontrada." });
    }
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
