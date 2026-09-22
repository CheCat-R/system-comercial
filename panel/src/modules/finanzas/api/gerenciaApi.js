/** Gerencia contra la API (F4): la rentabilidad real del negocio. */
import { httpClient } from "../../../app/api/httpClient";

export const gerenciaApi = {
  rentabilidad: (params) => httpClient.get("/gerencia/rentabilidad", { params }),
};

export const LENTES = {
  producto: { label: "Producto", clave: (x) => `p${x.productoId}`, nombre: (x) => x.nombre },
  marca: { label: "Marca", clave: (x) => `m${x.marcaId ?? 0}`, nombre: (x) => x.marca || "Sin marca" },
  categoria: { label: "Categoría", clave: (x) => `c${x.categoriaId ?? 0}`, nombre: (x) => x.categoria || "Sin categoría" },
  proveedor: { label: "Proveedor", clave: (x) => `v${x.proveedorId ?? 0}`, nombre: (x) => x.proveedor || "Sin proveedor" },
};

/** Agrupa `porProducto` por el lente elegido, sumando las mismas magnitudes que muestra la tabla. */
export const agruparPorLente = (filas, lente) => {
  if (lente === "producto") return filas;
  const L = LENTES[lente];
  const grupos = new Map();
  for (const x of filas) {
    const k = L.clave(x);
    const g = grupos.get(k) ?? {
      id: k, nombre: L.nombre(x), productos: 0, unidades: 0, ventaNeta: 0, ventaCosteada: 0,
      costo: 0, margenReal: 0, margenAparente: 0, ivaAbsorbido: 0, sinFactura: false,
    };
    g.productos += 1;
    g.unidades += x.unidades;
    g.ventaNeta += x.ventaNeta;
    g.ventaCosteada += x.ventaCosteada;
    g.costo += x.costo ?? 0;
    g.margenReal += x.margenReal ?? 0;
    g.margenAparente += x.margenAparente ?? 0;
    g.ivaAbsorbido += x.ivaAbsorbido;
    g.sinFactura = g.sinFactura || x.sinFactura;
    grupos.set(k, g);
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, margenRealPct: g.ventaCosteada > 0 ? (g.margenReal / g.ventaCosteada) * 100 : null }))
    .sort((a, b) => b.ventaNeta - a.ventaNeta);
};
