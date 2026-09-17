/**
 * React Query: el estado del servidor vive acá, no en useState de cada pantalla.
 * Los datos de catálogo cambian poco: 30 s de frescura evita repetir la misma
 * llamada al navegar entre pantallas; las mutaciones invalidan lo que tocan.
 */
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      retry: (count, err) => {
        // Un 4xx no se reintenta: el servidor ya dijo que no.
        if (err?.status && err.status < 500) return false;
        return count < 1;
      },
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});

/** Claves de cache, en un solo lugar para invalidar sin adivinar strings. */
export const QK = {
  yo: ["auth", "yo"],
  opciones: ["auth", "opciones"],
  sucursales: ["sucursales"],
  usuarios: ["usuarios"],
  roles: ["roles"],
  permisos: ["roles", "permisos"],
  terminales: ["terminales"],
  bootstrap: ["bootstrap"],
  productos: ["productos"],
  producto: (id) => ["productos", Number(id)],
  catalogos: ["catalogos"],
  proveedores: ["proveedores"],
  proveedor: (id) => ["proveedores", Number(id)],
  listas: ["listas"],
  stock: ["stock"],
  movimientos: (q) => ["movimientos", q || {}],
  transferencias: ["transferencias"],
  transferencia: (id) => ["transferencias", Number(id)],
  incidencias: ["incidencias"],
  conteos: ["conteos"],
  conteo: (id) => ["conteos", Number(id)],
  configuracion: (clave) => ["configuracion", clave],
  precios: {
    historial: (q) => ["precios", "historial", q || {}],
    evolucion: (q) => ["precios", "evolucion", q || {}],
    ultimoCambio: ["precios", "ultimo-cambio"],
  },
  auditoria: (entidad, id) => ["auditoria", entidad, Number(id)],
  chat: ["chat"],
};
