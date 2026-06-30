// data.js — Capa única de acceso a datos. Server.js solo habla con este
// archivo y no le importa si los datos vienen de Loyverse (modo real) o
// de db.js (modo demo local, sin token configurado).

const { randomUUID } = require("crypto");
const db = require("./db");
const loyverse = require("./loyverse");

const MODO_LOYVERSE = loyverse.activo();

function registrarMovimiento(tipo, detalle) {
  db.get("movimientos").push({ id: randomUUID(), tipo, detalle, fecha: new Date().toISOString() }).write();
}

function getActividad() {
  return db.get("movimientos").value().slice().reverse().slice(0, 100);
}

// --- Gastos mensuales: siempre locales, sin importar el modo ---
function getGastosMensuales(ubicacionId) {
  const gastos = db.get("configuracion.gastosMensuales").value() || {};
  if (!ubicacionId || ubicacionId === "todas") {
    const total = Object.values(gastos).reduce((acc, v) => acc + Number(v || 0), 0);
    return { ubicacionId: "todas", gastosMensuales: Number(total.toFixed(2)), porUbicacion: gastos };
  }
  return { ubicacionId, gastosMensuales: Number(gastos[ubicacionId] || 0) };
}

function setGastosMensuales(ubicacionId, monto) {
  db.set(`configuracion.gastosMensuales.${ubicacionId}`, Number(monto.toFixed(2))).write();
}

if (MODO_LOYVERSE) {
  // ====================== MODO LOYVERSE (real) ======================
  module.exports = {
    modo: "loyverse",

    async getUbicaciones() {
      return loyverse.getUbicaciones();
    },

    async nombreUbicacion(id) {
      const u = (await loyverse.getUbicaciones()).find((x) => x.id === id);
      return u ? u.nombre : "Ubicación desconocida";
    },

    async getProductos(ubicacionId) {
      const todos = await loyverse.getProductos();
      if (!ubicacionId || ubicacionId === "todas") return todos;
      return todos.filter((p) => p.ubicacionId === ubicacionId);
    },

    async getProducto(id) {
      const todos = await loyverse.getProductos();
      return todos.find((p) => p.id === id) || null;
    },

    async buscarPorCodigo(codigo) {
      const c = String(codigo).trim().toLowerCase();
      const todos = await loyverse.getProductos();
      return todos.find((p) => String(p.barcode).toLowerCase() === c || String(p.sku).toLowerCase() === c) || null;
    },

    async venderUno(id, cantidad) {
      const p = await this.getProducto(id);
      if (!p) return { error: "Producto no encontrado." };
      if (p.stockActual < cantidad) return { error: `No hay suficiente stock disponible (quedan ${p.stockActual}).` };

      await loyverse.ajustarStock({ variantId: p.variantId, storeId: p.ubicacionId, delta: -cantidad, motivo: "Venta rápida desde Olimpo Control" });
      registrarMovimiento("venta", {
        producto: p.nombre,
        cantidad,
        total: Number((p.precio * cantidad).toFixed(2)),
        ubicacion: await this.nombreUbicacion(p.ubicacionId),
      });
      return { producto: await this.getProducto(id) };
    },

    async ajustar(id, delta, motivo) {
      const p = await this.getProducto(id);
      if (!p) return { error: "Producto no encontrado." };
      if (p.stockActual + delta < 0) return { error: `Ese ajuste dejaría el stock en negativo (actual: ${p.stockActual}).` };

      await loyverse.ajustarStock({ variantId: p.variantId, storeId: p.ubicacionId, delta, motivo });
      registrarMovimiento("ajuste", {
        producto: p.nombre,
        delta,
        motivo,
        stockResultante: p.stockActual + delta,
        ubicacion: await this.nombreUbicacion(p.ubicacionId),
      });
      return { producto: await this.getProducto(id) };
    },

    async getVentasHoy(ubicacionId, fechaISO) {
      return loyverse.getVentasHoy(ubicacionId, fechaISO);
    },

    getActividad,
    getGastosMensuales,
    setGastosMensuales,
  };
} else {
  // ====================== MODO DEMO (local, sin token) ======================
  function nombreUbicacionLocal(id) {
    const u = db.get("ubicaciones").find({ id }).value();
    return u ? u.nombre : "Ubicación desconocida";
  }

  module.exports = {
    modo: "demo",

    async getUbicaciones() {
      return db.get("ubicaciones").value();
    },

    async nombreUbicacion(id) {
      return nombreUbicacionLocal(id);
    },

    async getProductos(ubicacionId) {
      let lista = db.get("productos").value();
      if (ubicacionId && ubicacionId !== "todas") lista = lista.filter((p) => p.ubicacionId === ubicacionId);
      return lista;
    },

    async getProducto(id) {
      return db.get("productos").find({ id }).value() || null;
    },

    async buscarPorCodigo(codigo) {
      const c = String(codigo).trim().toLowerCase();
      return (
        db
          .get("productos")
          .find((x) => String(x.barcode).toLowerCase() === c || String(x.sku).toLowerCase() === c)
          .value() || null
      );
    },

    async venderUno(id, cantidad) {
      const p = db.get("productos").find({ id }).value();
      if (!p) return { error: "Producto no encontrado." };
      if (p.stockActual < cantidad) return { error: `No hay suficiente stock disponible (quedan ${p.stockActual}).` };

      db.get("productos").find({ id }).assign({ stockActual: p.stockActual - cantidad }).write();
      db.get("ventas")
        .push({ id: randomUUID(), productoId: p.id, ubicacionId: p.ubicacionId, cantidad, precioUnit: p.precio, costoUnit: p.costo, fecha: new Date().toISOString() })
        .write();
      registrarMovimiento("venta", {
        producto: p.nombre,
        cantidad,
        total: Number((p.precio * cantidad).toFixed(2)),
        ubicacion: nombreUbicacionLocal(p.ubicacionId),
      });
      return { producto: db.get("productos").find({ id }).value() };
    },

    async ajustar(id, delta, motivo) {
      const p = db.get("productos").find({ id }).value();
      if (!p) return { error: "Producto no encontrado." };
      const nuevoStock = p.stockActual + delta;
      if (nuevoStock < 0) return { error: `Ese ajuste dejaría el stock en negativo (actual: ${p.stockActual}).` };

      db.get("productos").find({ id }).assign({ stockActual: nuevoStock }).write();
      registrarMovimiento("ajuste", {
        producto: p.nombre,
        delta,
        motivo,
        stockResultante: nuevoStock,
        ubicacion: nombreUbicacionLocal(p.ubicacionId),
      });
      return { producto: db.get("productos").find({ id }).value() };
    },

    async getVentasHoy(ubicacionId, fechaISO) {
      const ZONA = "America/Guayaquil";
      const esDeHoy = (fechaISOVenta) => {
        if (!fechaISOVenta) return false;
        const f = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date(fechaISOVenta));
        return f === fechaISO;
      };
      return db
        .get("ventas")
        .value()
        .filter((v) => esDeHoy(v.fecha) && (!ubicacionId || ubicacionId === "todas" || v.ubicacionId === ubicacionId));
    },

    getActividad,
    getGastosMensuales,
    setGastosMensuales,
  };
}
