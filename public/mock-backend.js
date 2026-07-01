// mock-backend.js — Backend simulado dentro del navegador, para la demo
// pública en GitHub Pages (que no puede correr Node). Intercepta fetch a
// /api/* y responde con la misma lógica que server.js, usando datos de
// ejemplo en memoria. En el servidor real este archivo NO se carga.
(function () {
  // Marca global para que index.html sepa que corre sin backend real y NUNCA
  // muestre un mensaje de "el servidor no responde" en la demo pública.
  window.OC_DEMO = true;
  const ZONA = "America/Guayaquil";
  function hoyISO() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  }
  function diasEnMesActual() {
    const [anio, mes] = hoyISO().split("-").map(Number);
    return new Date(anio, mes, 0).getDate();
  }

  const ubicaciones = [
    { id: "centro", nombre: "Mostrador Centro" },
    { id: "feria", nombre: "Mostrador Feria Libre" },
    { id: "terminal", nombre: "Kiosco Terminal Terrestre" },
  ];

  const productos = [
    { id: "p01", nombre: "Marlboro Rojo Cajetilla", categoria: "Cigarrillos", sku: "MAR-RED-20", barcode: "7501234567001", ubicacionId: "centro", precio: 4.5, costo: 3.2, stockActual: 36, umbralRojo: 10, umbralAmarillo: 20, proveedor: "Distribuidora Andina" },
    { id: "p02", nombre: "Marlboro Gold Cajetilla", categoria: "Cigarrillos", sku: "MAR-GLD-20", barcode: "7501234567002", ubicacionId: "centro", precio: 4.5, costo: 3.2, stockActual: 6, umbralRojo: 10, umbralAmarillo: 20, proveedor: "Distribuidora Andina" },
    { id: "p03", nombre: "Vaper Desechable Frutos Rojos", categoria: "Vapes", sku: "VAP-FR-001", barcode: "7501234567003", ubicacionId: "centro", precio: 12.0, costo: 6.0, stockActual: 18, umbralRojo: 5, umbralAmarillo: 10, proveedor: "VapeCity EC" },
    { id: "p04", nombre: "Encendedor Clipper Clásico", categoria: "Accesorios", sku: "ENC-CLI-001", barcode: "7501234567004", ubicacionId: "centro", precio: 1.75, costo: 0.6, stockActual: 80, umbralRojo: 15, umbralAmarillo: 30, proveedor: "Importadora Sur" },
    { id: "p05", nombre: "Papel Rizla King Size", categoria: "Accesorios", sku: "RIZ-KS-001", barcode: "7501234567005", ubicacionId: "centro", precio: 1.2, costo: 0.45, stockActual: 14, umbralRojo: 8, umbralAmarillo: 15, proveedor: "Importadora Sur" },
    { id: "p06", nombre: "Lark Box 20", categoria: "Cigarrillos", sku: "LRK-BOX-20", barcode: "7501234567006", ubicacionId: "feria", precio: 4.0, costo: 2.9, stockActual: 24, umbralRojo: 10, umbralAmarillo: 18, proveedor: "Distribuidora Andina" },
    { id: "p07", nombre: "Puro Backwoods Original", categoria: "Puros", sku: "BWD-ORG-001", barcode: "7501234567007", ubicacionId: "feria", precio: 3.5, costo: 1.4, stockActual: 22, umbralRojo: 6, umbralAmarillo: 12, proveedor: "Importadora Sur" },
    { id: "p08", nombre: "Vaper Desechable Menta Hielo", categoria: "Vapes", sku: "VAP-MH-001", barcode: "7501234567008", ubicacionId: "feria", precio: 12.0, costo: 6.5, stockActual: 4, umbralRojo: 5, umbralAmarillo: 10, proveedor: "VapeCity EC" },
    { id: "p09", nombre: "Agua Cielo 600ml", categoria: "Bebidas", sku: "AGU-600-001", barcode: "7501234567009", ubicacionId: "feria", precio: 0.8, costo: 0.45, stockActual: 60, umbralRojo: 12, umbralAmarillo: 24, proveedor: "Tía Distribución", perecible: true, fechaCaducidad: "2026-09-15", metodoCosteo: "FIFO" },
    { id: "p10", nombre: "Encendedor Bic Surtido", categoria: "Accesorios", sku: "ENC-BIC-001", barcode: "7501234567010", ubicacionId: "feria", precio: 1.5, costo: 0.5, stockActual: 9, umbralRojo: 10, umbralAmarillo: 20, proveedor: "Importadora Sur" },
    { id: "p11", nombre: "Pielroja Cajetilla", categoria: "Cigarrillos", sku: "PRJ-CAJ-20", barcode: "7501234567011", ubicacionId: "terminal", precio: 3.75, costo: 2.7, stockActual: 30, umbralRojo: 10, umbralAmarillo: 18, proveedor: "Distribuidora Andina" },
    { id: "p12", nombre: "Chicle Trident Menta", categoria: "Snacks", sku: "TRI-MEN-001", barcode: "7501234567012", ubicacionId: "terminal", precio: 0.6, costo: 0.25, stockActual: 50, umbralRojo: 10, umbralAmarillo: 20, proveedor: "Tía Distribución" },
    { id: "p13", nombre: "Vaper Desechable Mango", categoria: "Vapes", sku: "VAP-MNG-001", barcode: "7501234567013", ubicacionId: "terminal", precio: 12.5, costo: 6.0, stockActual: 16, umbralRojo: 5, umbralAmarillo: 10, proveedor: "VapeCity EC" },
    { id: "p14", nombre: "Café en Lata Listo", categoria: "Bebidas", sku: "CAF-LAT-001", barcode: "7501234567014", ubicacionId: "terminal", precio: 1.1, costo: 0.65, stockActual: 3, umbralRojo: 8, umbralAmarillo: 16, proveedor: "Tía Distribución", perecible: true, fechaCaducidad: "2026-07-10", metodoCosteo: "FIFO" },
    { id: "p15", nombre: "Filtros de Cartón Pack 50", categoria: "Accesorios", sku: "FIL-CRT-050", barcode: "7501234567015", ubicacionId: "terminal", precio: 1.0, costo: 0.35, stockActual: 28, umbralRojo: 8, umbralAmarillo: 15, proveedor: "Importadora Sur" },
  ];

  const ventas = [];
  const movimientos = [];
  const gastosMensuales = { centro: 0, feria: 0, terminal: 0 };
  const ORDEN = { rojo: 0, amarillo: 1, azul: 2, verde: 3 };

  function nombreUbic(id) { const u = ubicaciones.find((x) => x.id === id); return u ? u.nombre : "Ubicación desconocida"; }
  // Días para vencer (negativo = ya venció). Espejo de diasParaVencer() en server.js.
  function diasParaVencer(fecha) {
    if (!fecha) return null;
    const hoy = new Date(hoyISO() + "T00:00:00");
    const venc = new Date(fecha + "T00:00:00");
    return Math.round((venc - hoy) / 86400000);
  }
  // Espejo de calcularEstado() en server.js: combina stock + vencimiento,
  // se queda con la señal más grave de las dos.
  function estadoDe(p) {
    const margen = p.precio > 0 ? (p.precio - p.costo) / p.precio : 0;
    const dias = p.perecible ? diasParaVencer(p.fechaCaducidad) : null;
    let porStock;
    if (p.stockActual <= 0) porStock = { estado: "rojo", mensaje: "Sin stock — repón cuanto antes" };
    else if (p.stockActual <= p.umbralRojo) porStock = { estado: "rojo", mensaje: `Quedan ${p.stockActual} — reponer urgente` };
    else if (p.stockActual <= p.umbralAmarillo) porStock = { estado: "amarillo", mensaje: `Quedan ${p.stockActual} — revisar pronto` };
    else if (margen >= 0.5) porStock = { estado: "azul", mensaje: "Buen margen — impúlsalo esta semana" };
    else porStock = { estado: "verde", mensaje: "Stock saludable" };
    if (dias == null) return { ...porStock, dias };
    let porVenc = null;
    if (dias < 0) porVenc = { estado: "rojo", mensaje: `Venció hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? "" : "s"} — retíralo` };
    else if (dias <= 3) porVenc = { estado: "rojo", mensaje: `Vence en ${dias} día${dias === 1 ? "" : "s"} — véndelo ya` };
    else if (dias <= 7) porVenc = { estado: "amarillo", mensaje: `Vence en ${dias} días — véndelo primero` };
    if (!porVenc) return { ...porStock, dias };
    const masGrave = ORDEN[porVenc.estado] <= ORDEN[porStock.estado] ? porVenc : porStock;
    return { ...masGrave, dias };
  }
  function ficha(p) {
    const e = estadoDe(p);
    return { id: p.id, nombre: p.nombre, precio: p.precio, sku: p.sku, barcode: p.barcode, proveedor: p.proveedor, stockActual: p.stockActual, estado: e.estado, mensaje: e.mensaje, categoria: p.categoria, ubicacionId: p.ubicacionId, ubicacionNombre: nombreUbic(p.ubicacionId), perecible: !!p.perecible, fechaCaducidad: p.fechaCaducidad || null, diasParaVencer: e.dias, metodoCosteo: p.metodoCosteo || "FIFO", foto: p.foto || null };
  }
  function filtrar(uid) { return !uid || uid === "todas" ? productos : productos.filter((p) => p.ubicacionId === uid); }
  function ventasHoyDe(uid) { return ventas.filter((v) => (!uid || uid === "todas" || v.ubicacionId === uid)); }
  function mov(tipo, detalle) { movimientos.push({ id: String(Date.now() + Math.random()), tipo, detalle, fecha: new Date().toISOString() }); }
  const J = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: { "Content-Type": "application/json" } });

  // Genera un QR como data URL sin dependencias: usa una API pública de imagen.
  // Para una demo es suficiente; el backend real lo genera localmente con qrcode.
  function qrDataUrl(payload) {
    return "https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=4&data=" + encodeURIComponent(payload);
  }

  const realFetch = window.fetch.bind(window);

  window.fetch = async function (url, opts) {
    try {
      const u = new URL(url, window.location.origin);
      if (!u.pathname.startsWith("/api")) return realFetch(url, opts);
      const path = u.pathname;
      const q = u.searchParams;
      const body = opts && opts.body ? JSON.parse(opts.body) : {};
      const uid = q.get("ubicacionId");

      if (path === "/api/modo") return J({ modo: "demo-estatico" });
      if (path === "/api/ubicaciones") return J(ubicaciones);

      if (path === "/api/dashboard") {
        const ps = filtrar(uid), vh = ventasHoyDe(uid);
        const entra = vh.reduce((a, v) => a + v.precioUnit * v.cantidad, 0);
        const sale = vh.reduce((a, v) => a + v.costoUnit * v.cantidad, 0);
        const inv = ps.reduce((a, p) => a + p.precio * p.stockActual, 0);
        const alertas = ps.map((p) => ({ p, ...estadoDe(p) })).filter((e) => e.estado === "rojo" || e.estado === "amarillo").sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado]).map((e) => ({ estado: e.estado, mensaje: `${e.p.nombre}: ${e.mensaje}` }));
        let sem = "verde";
        if (alertas.some((a) => a.estado === "rojo")) sem = "rojo"; else if (alertas.some((a) => a.estado === "amarillo")) sem = "amarillo";
        return J({ semaforoGeneral: sem, resumenDia: { entra: +entra.toFixed(2), sale: +sale.toFixed(2), gananciaHoy: +(entra - sale).toFixed(2), inventarioValorizado: +inv.toFixed(2), ventasCount: vh.length }, alertas });
      }

      if (path === "/api/productos" && (!opts || opts.method !== "POST")) {
        let lista = filtrar(uid).map((p) => { const e = estadoDe(p); return { id: p.id, nombre: p.nombre, categoria: p.categoria, sku: p.sku, stockActual: p.stockActual, estado: e.estado, mensaje: e.mensaje, precio: p.precio, perecible: !!p.perecible, fechaCaducidad: p.fechaCaducidad || null, diasParaVencer: e.dias, umbralRojo: p.umbralRojo }; });
        const est = q.get("estado");
        if (est) lista = lista.filter((x) => x.estado === est);
        lista.sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || a.nombre.localeCompare(b.nombre, "es"));
        return J(lista);
      }

      if (path === "/api/productos" && opts && opts.method === "POST") {
        if (!body.nombre || !body.barcode) return J({ error: "Falta el nombre o el código de barras." }, 400);
        if (body.perecible && !body.fechaCaducidad) return J({ error: "Si el producto expira, indica su fecha de caducidad." }, 400);
        const nuevo = {
          id: "p" + Math.random().toString(36).slice(2, 9), nombre: body.nombre, categoria: body.categoria || "General",
          sku: body.sku || body.barcode, barcode: body.barcode, ubicacionId: body.ubicacionId || "todas",
          precio: Number(body.precio) || 0, costo: Number(body.costo) || 0, stockActual: Number(body.stockInicial) || 0,
          umbralRojo: Number(body.umbralRojo) || 5, umbralAmarillo: Number(body.umbralAmarillo) || 10, proveedor: body.proveedor || "",
          perecible: !!body.perecible, fechaCaducidad: body.perecible ? (body.fechaCaducidad || null) : null,
          metodoCosteo: body.metodoCosteo === "LIFO" ? "LIFO" : "FIFO",
        };
        productos.push(nuevo);
        mov("alta", { producto: nuevo.nombre, sku: nuevo.sku, ubicacion: nombreUbic(nuevo.ubicacionId) });
        return J(ficha(nuevo));
      }

      let m;
      // Edicion libre de la ficha (nombre/apodo, foto, precios, codigo interno).
      // El gating por rol (empleado NO edita) vive en la UI; aca solo se aplica.
      if ((m = path.match(/^\/api\/productos\/([^/]+)$/)) && opts && opts.method === "PATCH") {
        const p = productos.find((x) => x.id === m[1]); if (!p) return J({ error: "Producto no encontrado." }, 404);
        const CAMPOS = ["nombre", "categoria", "precio", "costo", "proveedor", "foto", "barcode", "sku", "perecible", "fechaCaducidad", "metodoCosteo"];
        CAMPOS.forEach((k) => { if (body[k] !== undefined) p[k] = (k === "precio" || k === "costo") ? Number(body[k]) || 0 : body[k]; });
        mov("edicion", { producto: p.nombre, sku: p.sku, ubicacion: nombreUbic(p.ubicacionId) });
        return J(ficha(p));
      }
      // Borrado definitivo (dueno, doble confirmacion en la UI).
      if ((m = path.match(/^\/api\/productos\/([^/]+)$/)) && opts && opts.method === "DELETE") {
        const i = productos.findIndex((x) => x.id === m[1]); if (i === -1) return J({ error: "Producto no encontrado." }, 404);
        const borrado = productos.splice(i, 1)[0];
        mov("baja", { producto: borrado.nombre, sku: borrado.sku, ubicacion: nombreUbic(borrado.ubicacionId) });
        return J({ ok: true });
      }
      if ((m = path.match(/^\/api\/productos\/([^/]+)\/venta$/))) {
        const p = productos.find((x) => x.id === m[1]); if (!p) return J({ error: "Producto no encontrado." }, 404);
        const cant = Number.isInteger(body.cantidad) && body.cantidad > 0 ? body.cantidad : 1;
        if (p.stockActual < cant) return J({ error: `No hay suficiente stock disponible (quedan ${p.stockActual}).` }, 400);
        p.stockActual -= cant;
        const ventaId = String(Date.now() + Math.random());
        ventas.push({ id: ventaId, productoId: p.id, ubicacionId: p.ubicacionId, cantidad: cant, precioUnit: p.precio, costoUnit: p.costo, fecha: new Date().toISOString() });
        mov("venta", { producto: p.nombre, cantidad: cant, total: +(p.precio * cant).toFixed(2), ubicacion: nombreUbic(p.ubicacionId) });
        return J({ producto: ficha(p), ventaId });
      }
      if ((m = path.match(/^\/api\/ventas\/([^/]+)\/anular$/))) {
        const idx = ventas.findIndex((v) => v.id === m[1]);
        if (idx === -1) return J({ error: "Esta venta ya no se puede anular (pasó el tiempo o ya se anuló)." }, 400);
        const venta = ventas[idx];
        const p = productos.find((x) => x.id === venta.productoId);
        if (!p) return J({ error: "Producto no encontrado." }, 404);
        p.stockActual += venta.cantidad;
        ventas.splice(idx, 1);
        mov("anulacion", { producto: p.nombre, cantidad: venta.cantidad, ubicacion: nombreUbic(p.ubicacionId) });
        return J({ producto: ficha(p) });
      }
      if ((m = path.match(/^\/api\/productos\/([^/]+)\/ajustar$/))) {
        const p = productos.find((x) => x.id === m[1]); if (!p) return J({ error: "Producto no encontrado." }, 404);
        const d = Number.isInteger(body.delta) ? body.delta : 0;
        if (p.stockActual + d < 0) return J({ error: `Ese ajuste dejaría el stock en negativo (actual: ${p.stockActual}).` }, 400);
        p.stockActual += d;
        mov("ajuste", { producto: p.nombre, delta: d, motivo: body.motivo || "Ajuste manual", stockResultante: p.stockActual, ubicacion: nombreUbic(p.ubicacionId) });
        return J(ficha(p));
      }
      if ((m = path.match(/^\/api\/productos\/([^/]+)\/etiqueta$/))) {
        const p = productos.find((x) => x.id === m[1]); if (!p) return J({ error: "Producto no encontrado." }, 404);
        // Barcode: generado local con window.OCBarcode (barcode128.js), cero llamadas
        // externas. QR: sigue usando la API pública qrserver.com solo en esta demo
        // estática (el backend real lo genera 100% local con la librería "qrcode").
        const barcodeSvg = window.OCBarcode ? window.OCBarcode.code128SVG(p.barcode, { width: 300, height: 80 }) : "";
        return J({ producto: ficha(p), qrDataUrl: qrDataUrl(JSON.stringify({ id: p.id, sku: p.sku, barcode: p.barcode })), barcodeSvg });
      }
      if ((m = path.match(/^\/api\/productos\/([^/]+)$/))) {
        const p = productos.find((x) => x.id === m[1]); if (!p) return J({ error: "Producto no encontrado." }, 404);
        return J(ficha(p));
      }

      if (path === "/api/escanear") {
        const c = String(body.codigo || "").trim().toLowerCase();
        if (!c) return J({ error: "Código vacío." }, 400);
        const p = productos.find((x) => String(x.barcode).toLowerCase() === c || String(x.sku).toLowerCase() === c);
        if (!p) return J({ error: "No se encontró ningún producto con ese código." }, 404);
        return J(ficha(p));
      }

      if (path === "/api/actividad") return J(movimientos.slice().reverse().slice(0, 100));

      if ((m = path.match(/^\/api\/productos\/([^/]+)\/umbrales$/))) {
        const p = productos.find((x) => x.id === m[1]); if (!p) return J({ error: "Producto no encontrado." }, 404);
        const umbralRojo = Number(body.umbralRojo);
        if (!Number.isInteger(umbralRojo) || umbralRojo < 1) return J({ error: "El umbral debe ser un número entero de al menos 1." }, 400);
        p.umbralRojo = umbralRojo;
        p.umbralAmarillo = umbralRojo * 2;
        return J(ficha(p));
      }

      if (path === "/api/respaldo/exportar") {
        return J({ modo: "demo-estatico", ubicaciones, productos, ventas, movimientos, configuracion: { gastosMensuales } });
      }
      if (path === "/api/respaldo/importar") {
        try {
          if (!body.productos || !body.ubicaciones) return J({ error: "El archivo no parece un respaldo válido." }, 400);
          productos.length = 0; productos.push(...body.productos);
          ubicaciones.length = 0; ubicaciones.push(...body.ubicaciones);
          ventas.length = 0; ventas.push(...(body.ventas || []));
          movimientos.length = 0; movimientos.push(...(body.movimientos || []));
          if (body.configuracion && body.configuracion.gastosMensuales) {
            Object.keys(gastosMensuales).forEach((k) => delete gastosMensuales[k]);
            Object.assign(gastosMensuales, body.configuracion.gastosMensuales);
          }
          return J({ ok: true });
        } catch (e) { return J({ error: "No se pudo importar: " + String(e) }, 400); }
      }

      if (path === "/api/configuracion/gastos" && (!opts || opts.method !== "POST")) {
        if (!uid || uid === "todas") return J({ ubicacionId: "todas", gastosMensuales: +Object.values(gastosMensuales).reduce((a, v) => a + v, 0).toFixed(2), porUbicacion: gastosMensuales });
        return J({ ubicacionId: uid, gastosMensuales: gastosMensuales[uid] || 0 });
      }
      if (path === "/api/configuracion/gastos") {
        const { ubicacionId, gastosMensuales: g } = body; const monto = Number(g);
        // "todas" es válido: ubicaciones está DORMANT en Olimpo (selector oculto,
        // siempre vale "todas"), así que el negocio opera como una sola tienda
        // virtual bajo esa clave. Ver la misma nota en server.js.
        if (!ubicacionId) return J({ error: "Falta la ubicación." }, 400);
        if (!isFinite(monto) || monto < 0) return J({ error: "El monto debe ser un número igual o mayor a 0." }, 400);
        gastosMensuales[ubicacionId] = +monto.toFixed(2);
        return J({ ubicacionId, gastosMensuales: gastosMensuales[ubicacionId] });
      }

      if (path === "/api/reportes/pl") {
        const vh = ventasHoyDe(uid);
        const ing = vh.reduce((a, v) => a + v.precioUnit * v.cantidad, 0);
        const cv = vh.reduce((a, v) => a + v.costoUnit * v.cantidad, 0);
        const gm = (!uid || uid === "todas") ? Object.values(gastosMensuales).reduce((a, v) => a + v, 0) : (gastosMensuales[uid] || 0);
        const go = +(gm / diasEnMesActual()).toFixed(2);
        return J({ ingresos: +ing.toFixed(2), costoVentas: +cv.toFixed(2), utilidadBruta: +(ing - cv).toFixed(2), gastosOperativos: go, utilidadNeta: +(ing - cv - go).toFixed(2) });
      }
      if (path === "/api/reportes/balance") {
        const ps = filtrar(uid), vh = ventasHoyDe(uid);
        const ef = vh.reduce((a, v) => a + v.precioUnit * v.cantidad, 0);
        const inv = ps.reduce((a, p) => a + p.precio * p.stockActual, 0);
        return J({ activos: { efectivoEstimado: +ef.toFixed(2), inventarioValorizado: +inv.toFixed(2), total: +(ef + inv).toFixed(2) } });
      }
      if (path === "/api/reportes/valorizado") {
        const filas = filtrar(uid).map((p) => ({ nombre: p.nombre, stockActual: p.stockActual, valorCosto: +(p.costo * p.stockActual).toFixed(2), valorVenta: +(p.precio * p.stockActual).toFixed(2), utilidadPotencial: +((p.precio - p.costo) * p.stockActual).toFixed(2) }));
        const t = filas.reduce((a, f) => ({ valorCosto: a.valorCosto + f.valorCosto, valorVenta: a.valorVenta + f.valorVenta, utilidadPotencial: a.utilidadPotencial + f.utilidadPotencial }), { valorCosto: 0, valorVenta: 0, utilidadPotencial: 0 });
        return J({ productos: filas, totales: { valorCosto: +t.valorCosto.toFixed(2), valorVenta: +t.valorVenta.toFixed(2), utilidadPotencial: +t.utilidadPotencial.toFixed(2) } });
      }

      return J({ error: "Ruta no encontrada en la demo." }, 404);
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  };
})();
