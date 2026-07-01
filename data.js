// data.js — Capa única de acceso a datos. Server.js solo habla con este
// archivo y no le importa si los datos vienen de Loyverse (modo real) o
// de db.js (modo demo local, sin token configurado).

const { randomUUID } = require("crypto");
const db = require("./db");
const loyverse = require("./loyverse");
const umbrales = require("./umbrales");

const MODO_LOYVERSE = loyverse.activo();
let ultimaVentaLoyverse = null; // ver anularVenta() en modo Loyverse, más abajo

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

// ---------------------------------------------------------------------------
// RESPALDO EXPORTABLE (tronco 3, JFC 2026-07-01): protege contra "se borró el
// caché del navegador" o "se rompió la tablet" — sin esto, el negocio entero
// vivía solo en un archivo en un disco. En modo demo, db.json ES la fuente de
// verdad completa (productos, ventas, movimientos, gastos, ubicaciones) y se
// exporta/importa entera. En modo Loyverse, productos/ventas viven en
// Loyverse (no aquí), así que solo se respaldan movimientos y gastos locales
// — se avisa explícitamente, no se finge un respaldo completo que no lo es.
// ---------------------------------------------------------------------------
function exportarTodo() {
  if (MODO_LOYVERSE) {
    return {
      modo: "loyverse",
      aviso: "Productos, ventas e inventario viven en Loyverse — respáldalos desde ahí. Este archivo solo contiene movimientos y gastos locales.",
      movimientos: db.get("movimientos").value(),
      configuracion: db.get("configuracion").value(),
    };
  }
  return { modo: "demo", ...db.getState() };
}

function importarTodo(datos) {
  if (!datos || typeof datos !== "object") return { error: "Archivo de respaldo inválido." };
  if (MODO_LOYVERSE) {
    if (datos.movimientos) db.set("movimientos", datos.movimientos).write();
    if (datos.configuracion) db.set("configuracion", datos.configuracion).write();
    return { ok: true };
  }
  if (datos.modo && datos.modo !== "demo") return { error: "Este respaldo es de otro modo (Loyverse) y no aplica aquí." };
  const { modo, ...estado } = datos;
  if (!estado.productos || !estado.ubicaciones) return { error: "El archivo no parece un respaldo válido de Olimpo Control." };
  db.setState(estado);
  return { ok: true };
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

    // Dar de alta catálogo nuevo se hace en Loyverse mismo (es la fuente de
    // verdad del inventario en este modo); acá solo se lee y refleja. Si en
    // el futuro se quiere crear desde Olimpo Control, hay que llamar al
    // endpoint de creación de items de la API de Loyverse — no implementado
    // todavía porque José aún no ha conectado su cuenta real.
    async crearProducto() {
      return { error: "Con Loyverse conectado, da de alta productos nuevos directamente en Loyverse — Olimpo Control los reflejará automáticamente." };
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
      // ventaId propio (no de Loyverse) — solo sirve para la ventana de
      // "deshacer" de 5s en esta sesión. Ver limitación en anularVenta().
      ultimaVentaLoyverse = { ventaId: randomUUID(), productoId: id, cantidad };
      return { producto: await this.getProducto(id), ventaId: ultimaVentaLoyverse.ventaId };
    },

    // LIMITACIÓN CONOCIDA en modo Loyverse: podemos revertir el AJUSTE DE
    // STOCK (sí lo hacemos, vía ajustarStock), pero el registro de venta en
    // los reportes de Loyverse mismo (su propio dashboard) NO se puede
    // anular desde aquí — Loyverse no expone un endpoint de "anular venta"
    // en su API pública. Si José necesita eso, tendría que anularla también
    // dentro de Loyverse. Documentado, no oculto.
    async anularVenta(ventaId) {
      if (!ultimaVentaLoyverse || ultimaVentaLoyverse.ventaId !== ventaId) {
        return { error: "Esta venta ya no se puede anular (pasó el tiempo o ya se anuló)." };
      }
      const { productoId, cantidad } = ultimaVentaLoyverse;
      ultimaVentaLoyverse = null;
      const p = await this.getProducto(productoId);
      if (!p) return { error: "Producto no encontrado." };
      await loyverse.ajustarStock({ variantId: p.variantId, storeId: p.ubicacionId, delta: cantidad, motivo: "Anulación de venta (deshacer)" });
      registrarMovimiento("anulacion", { producto: p.nombre, cantidad, ubicacion: await this.nombreUbicacion(p.ubicacionId) });
      return { producto: await this.getProducto(productoId) };
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

    // BUG FIJADO (JFC, 2026-07-01): este endpoint existía en server.js desde
    // hace rato pero ninguna pantalla lo llamaba — el umbral se podía LEER
    // (loyverse.js lo aplica al traer productos) pero nunca se podía GUARDAR
    // desde la app. En modo Loyverse el umbral vive en umbrales.json (fuera
    // de Loyverse, que no expone esto de forma consistente entre planes).
    async actualizarUmbrales(id, umbralRojo) {
      const p = await this.getProducto(id);
      if (!p) return { error: "Producto no encontrado." };
      umbrales.set(p.variantId || id, { umbralRojo, umbralAmarillo: umbralRojo * 2 });
      return { producto: await this.getProducto(id) };
    },

    getActividad,
    getGastosMensuales,
    setGastosMensuales,
    exportarTodo,
    importarTodo,
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

    // Crea un producto nuevo (solo modo demo/local — en modo Loyverse el
    // catálogo se gestiona en Loyverse mismo; ver nota en server.js). Se usa
    // cuando el dueño escanea un código que no existe y decide darlo de alta.
    async crearProducto(datos) {
      const p = {
        id: randomUUID(),
        nombre: datos.nombre,
        categoria: datos.categoria || "General",
        sku: datos.sku || datos.barcode,
        barcode: datos.barcode,
        ubicacionId: datos.ubicacionId || "todas",
        precio: Number(datos.precio) || 0,
        costo: Number(datos.costo) || 0,
        stockActual: Number(datos.stockInicial) || 0,
        umbralRojo: Number(datos.umbralRojo) || 5,
        umbralAmarillo: Number(datos.umbralAmarillo) || 10,
        proveedor: datos.proveedor || "",
        perecible: !!datos.perecible,
        fechaCaducidad: datos.perecible ? datos.fechaCaducidad || null : null,
        metodoCosteo: datos.metodoCosteo === "LIFO" ? "LIFO" : "FIFO",
        lotes: [], // terreno listo para costeo por lotes (fase 2, ver db.js)
      };
      db.get("productos").push(p).write();
      registrarMovimiento("alta", { producto: p.nombre, sku: p.sku, ubicacion: nombreUbicacionLocal(p.ubicacionId) });
      return p;
    },

    async venderUno(id, cantidad) {
      const p = db.get("productos").find({ id }).value();
      if (!p) return { error: "Producto no encontrado." };
      if (p.stockActual < cantidad) return { error: `No hay suficiente stock disponible (quedan ${p.stockActual}).` };

      const ventaId = randomUUID();
      db.get("productos").find({ id }).assign({ stockActual: p.stockActual - cantidad }).write();
      db.get("ventas")
        .push({ id: ventaId, productoId: p.id, ubicacionId: p.ubicacionId, cantidad, precioUnit: p.precio, costoUnit: p.costo, fecha: new Date().toISOString() })
        .write();
      registrarMovimiento("venta", {
        producto: p.nombre,
        cantidad,
        total: Number((p.precio * cantidad).toFixed(2)),
        ubicacion: nombreUbicacionLocal(p.ubicacionId),
      });
      return { producto: db.get("productos").find({ id }).value(), ventaId };
    },

    // Anula una venta reciente (tronco 2, JFC 2026-06-30: "botón de deshacer,
    // 5 segundos"). A propósito ELIMINA el registro de venta en vez de dejarlo
    // y agregar uno negativo: dentro de la ventana de 5s esto es corregir un
    // toque accidental, no un reembolso formal — nunca debió contar como
    // venta real, así que no debe aparecer en ningún reporte del día. Un
    // reembolso posterior (fuera de esta ventana) es un caso distinto, no
    // cubierto aquí, y necesitaría su propio registro contable.
    async anularVenta(ventaId) {
      const venta = db.get("ventas").find({ id: ventaId }).value();
      if (!venta) return { error: "Esta venta ya no se puede anular (pasó el tiempo o ya se anuló)." };
      const p = db.get("productos").find({ id: venta.productoId }).value();
      if (!p) return { error: "Producto no encontrado." };
      db.get("productos").find({ id: venta.productoId }).assign({ stockActual: p.stockActual + venta.cantidad }).write();
      db.get("ventas").remove({ id: ventaId }).write();
      registrarMovimiento("anulacion", {
        producto: p.nombre,
        cantidad: venta.cantidad,
        ubicacion: nombreUbicacionLocal(venta.ubicacionId),
      });
      return { producto: db.get("productos").find({ id: venta.productoId }).value() };
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

    // BUG FIJADO (JFC, 2026-07-01): en modo demo el producto guarda su
    // propio umbralRojo/umbralAmarillo directamente (no hay Loyverse de por
    // medio), así que aquí se edita el producto mismo, no umbrales.json.
    async actualizarUmbrales(id, umbralRojo) {
      const p = db.get("productos").find({ id }).value();
      if (!p) return { error: "Producto no encontrado." };
      db.get("productos").find({ id }).assign({ umbralRojo, umbralAmarillo: umbralRojo * 2 }).write();
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
    exportarTodo,
    importarTodo,
  };
}
