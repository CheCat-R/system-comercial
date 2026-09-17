/**
 * Espejo liviano del catálogo (mismos nombres/SKU que `modules/productos/Productos.jsx`).
 * Inventario no reescribe el catálogo: cuando Productos tenga su propia capa `api/`,
 * este archivo se reemplaza por una lectura real — ver
 * docs/MODULO-INVENTARIO-ABASTECIMIENTO.md §2.4.
 *
 * `weightKg` se agrega para el motor de tarifas de Logística — ver
 * docs/MODULO-LOGISTICA-FULFILLMENT.md §2.3.
 *
 * `taxRate` (alícuota de IVA) se agrega para Facturación — ver
 * docs/MODULO-FINANZAS-FACTURACION.md §7.4. En Argentina indumentaria/calzado/accesorios van al
 * 21 %; el modelo soporta 10,5 % / 27 % / no gravado y la alícuota se puede editar por categoría
 * o por SKU desde Facturación › Impuestos.
 */
export const skus = [
  { id: "SKU-1", productId: 1, name: "Zapatillas Running X", sku: "ZAP-RUN-X-01", category: "Calzado", cost: 28000, weightKg: 0.8, taxRate: 0.21 },
  { id: "SKU-2", productId: 2, name: "Remera Básica Blanca", sku: "REM-BAS-BL-M", category: "Indumentaria", cost: 6000, weightKg: 0.2, taxRate: 0.21 },
  { id: "SKU-3", productId: 3, name: "Short Deportivo Elite", sku: "SHO-ELI-NG-L", category: "Indumentaria", cost: 9000, weightKg: 0.25, taxRate: 0.21 },
  { id: "SKU-4", productId: 4, name: "Gorra Snapback Urban", sku: "GOR-URB-01", category: "Accesorios", cost: 3500, weightKg: 0.15, taxRate: 0.21 },
  { id: "SKU-5", productId: 5, name: "Mochila Trekking 40L", sku: "MOC-TRK-40L", category: "Accesorios", cost: 32000, weightKg: 1.2, taxRate: 0.21 },
];
