// db.js — Persistencia simple en archivo JSON (lowdb).
// Por qué lowdb y no una base de datos pesada: cero dependencias nativas que puedan
// fallar al desplegar, cero configuración de servidor de base de datos, y un archivo
// db.json que se puede respaldar copiándolo. Para un negocio de 1 a 5 mostradores
// es más que suficiente y es muy fácil de migrar a Postgres más adelante si crece.

const path = require("path");
const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");

const dbPath = path.join(__dirname, "data", "db.json");
const fs = require("fs");
if (!fs.existsSync(path.join(__dirname, "data"))) {
  fs.mkdirSync(path.join(__dirname, "data"));
}

const adapter = new FileSync(dbPath);
const db = low(adapter);

// --- Datos semilla (solo se usan la primera vez que arranca el servidor) ---
const seed = {
  ubicaciones: [
    { id: "centro", nombre: "Mostrador Centro" },
    { id: "feria", nombre: "Mostrador Feria Libre" },
    { id: "terminal", nombre: "Kiosco Terminal Terrestre" },
  ],
  // Campos de inventario perecible/costeo (agregados 2026-06-30, pedido de JFC):
  //   perecible: bool — si el producto vence. No perecibles omiten el campo o lo
  //     dejan en false; no hace falta tocarlos.
  //   fechaCaducidad: "YYYY-MM-DD" | null — fecha exacta de vencimiento (elegimos
  //     fecha exacta y no solo un checkbox para poder alertar "vence en N días"
  //     y ordenar por vencimiento real, más preciso que por fecha de ingreso).
  //   metodoCosteo: "FIFO" | "LIFO" — hoy SOLO decide el orden de las alertas de
  //     "vence pronto" (FIFO = el que vence antes se muestra/vende primero;
  //     LIFO = el más nuevo primero). El costeo contable real sigue usando
  //     costo promedio por producto (stockActual + costo), NO consume lotes
  //     todavía.
  //   lotes: [] — TERRENO LISTO para costeo por lotes real (fase 2, pendiente):
  //     cuando se implemente, cada compra empuja aquí {cantidad, costo, fecha}
  //     y las ventas consumen lotes en orden FIFO/LIFO con su costo real en vez
  //     de un promedio. Por ahora queda vacío y sin usar — no romper este
  //     campo al tocar productos, es la migración futura ya preparada.
  productos: [
    // --- Mostrador Centro ---
    { id: "p01", nombre: "Marlboro Rojo Cajetilla", categoria: "Cigarrillos", sku: "MAR-RED-20", barcode: "7501234567001", ubicacionId: "centro", precio: 4.5, costo: 3.2, stockActual: 36, umbralRojo: 10, umbralAmarillo: 20, proveedor: "Distribuidora Andina" },
    { id: "p02", nombre: "Marlboro Gold Cajetilla", categoria: "Cigarrillos", sku: "MAR-GLD-20", barcode: "7501234567002", ubicacionId: "centro", precio: 4.5, costo: 3.2, stockActual: 6, umbralRojo: 10, umbralAmarillo: 20, proveedor: "Distribuidora Andina" },
    { id: "p03", nombre: "Vaper Desechable Frutos Rojos", categoria: "Vapes", sku: "VAP-FR-001", barcode: "7501234567003", ubicacionId: "centro", precio: 12.0, costo: 6.0, stockActual: 18, umbralRojo: 5, umbralAmarillo: 10, proveedor: "VapeCity EC" },
    { id: "p04", nombre: "Encendedor Clipper Clásico", categoria: "Accesorios", sku: "ENC-CLI-001", barcode: "7501234567004", ubicacionId: "centro", precio: 1.75, costo: 0.6, stockActual: 80, umbralRojo: 15, umbralAmarillo: 30, proveedor: "Importadora Sur" },
    { id: "p05", nombre: "Papel Rizla King Size", categoria: "Accesorios", sku: "RIZ-KS-001", barcode: "7501234567005", ubicacionId: "centro", precio: 1.2, costo: 0.45, stockActual: 14, umbralRojo: 8, umbralAmarillo: 15, proveedor: "Importadora Sur" },

    // --- Mostrador Feria Libre ---
    { id: "p06", nombre: "Lark Box 20", categoria: "Cigarrillos", sku: "LRK-BOX-20", barcode: "7501234567006", ubicacionId: "feria", precio: 4.0, costo: 2.9, stockActual: 24, umbralRojo: 10, umbralAmarillo: 18, proveedor: "Distribuidora Andina" },
    { id: "p07", nombre: "Puro Backwoods Original", categoria: "Puros", sku: "BWD-ORG-001", barcode: "7501234567007", ubicacionId: "feria", precio: 3.5, costo: 1.4, stockActual: 22, umbralRojo: 6, umbralAmarillo: 12, proveedor: "Importadora Sur" },
    { id: "p08", nombre: "Vaper Desechable Menta Hielo", categoria: "Vapes", sku: "VAP-MH-001", barcode: "7501234567008", ubicacionId: "feria", precio: 12.0, costo: 6.5, stockActual: 4, umbralRojo: 5, umbralAmarillo: 10, proveedor: "VapeCity EC" },
    { id: "p09", nombre: "Agua Cielo 600ml", categoria: "Bebidas", sku: "AGU-600-001", barcode: "7501234567009", ubicacionId: "feria", precio: 0.8, costo: 0.45, stockActual: 60, umbralRojo: 12, umbralAmarillo: 24, proveedor: "Tía Distribución", perecible: true, fechaCaducidad: "2026-09-15", metodoCosteo: "FIFO", lotes: [] },
    { id: "p10", nombre: "Encendedor Bic Surtido", categoria: "Accesorios", sku: "ENC-BIC-001", barcode: "7501234567010", ubicacionId: "feria", precio: 1.5, costo: 0.5, stockActual: 9, umbralRojo: 10, umbralAmarillo: 20, proveedor: "Importadora Sur" },

    // --- Kiosco Terminal Terrestre ---
    { id: "p11", nombre: "Pielroja Cajetilla", categoria: "Cigarrillos", sku: "PRJ-CAJ-20", barcode: "7501234567011", ubicacionId: "terminal", precio: 3.75, costo: 2.7, stockActual: 30, umbralRojo: 10, umbralAmarillo: 18, proveedor: "Distribuidora Andina" },
    { id: "p12", nombre: "Chicle Trident Menta", categoria: "Snacks", sku: "TRI-MEN-001", barcode: "7501234567012", ubicacionId: "terminal", precio: 0.6, costo: 0.25, stockActual: 50, umbralRojo: 10, umbralAmarillo: 20, proveedor: "Tía Distribución" },
    { id: "p13", nombre: "Vaper Desechable Mango", categoria: "Vapes", sku: "VAP-MNG-001", barcode: "7501234567013", ubicacionId: "terminal", precio: 12.5, costo: 6.0, stockActual: 16, umbralRojo: 5, umbralAmarillo: 10, proveedor: "VapeCity EC" },
    { id: "p14", nombre: "Café en Lata Listo", categoria: "Bebidas", sku: "CAF-LAT-001", barcode: "7501234567014", ubicacionId: "terminal", precio: 1.1, costo: 0.65, stockActual: 3, umbralRojo: 8, umbralAmarillo: 16, proveedor: "Tía Distribución", perecible: true, fechaCaducidad: "2026-07-10", metodoCosteo: "FIFO", lotes: [] },
    { id: "p15", nombre: "Filtros de Cartón Pack 50", categoria: "Accesorios", sku: "FIL-CRT-050", barcode: "7501234567015", ubicacionId: "terminal", precio: 1.0, costo: 0.35, stockActual: 28, umbralRojo: 8, umbralAmarillo: 15, proveedor: "Importadora Sur" },
  ],
  ventas: [],
  movimientos: [],
  // Gastos mensuales fijos por ubicación (arriendo, luz, sueldos, etc.).
  // Se ingresan a mano en la vista "Avanzado" y se prorratean entre 30
  // para estimar el gasto operativo del día en el P&L.
  configuracion: {
    gastosMensuales: {
      centro: 0,
      feria: 0,
      terminal: 0,
    },
  },
};

db.defaults(seed).write();

module.exports = db;
