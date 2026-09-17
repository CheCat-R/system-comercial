/** Las consultas que todas las pantallas de inventario comparten: productos, sucursales y stock. */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { QK } from "../../../app/api/queryClient";
import { productosApi } from "../../productos/api/productosApi";
import { seguridadApi } from "../../seguridad/api/seguridadApi";
import { inventarioApi } from "../api/inventarioApi";

export const useInventarioBase = () => {
  const productos = useQuery({ queryKey: QK.productos, queryFn: productosApi.listar });
  const sucursales = useQuery({ queryKey: QK.sucursales, queryFn: seguridadApi.sucursales });
  const stock = useQuery({ queryKey: QK.stock, queryFn: inventarioApi.stock });

  const productoDe = useMemo(() => {
    const m = {};
    (productos.data || []).forEach((p) => { m[p.id] = p; });
    return (id) => m[id];
  }, [productos.data]);

  const sucursalDe = useMemo(() => {
    const m = {};
    (sucursales.data || []).forEach((s) => { m[s.id] = s; });
    return (id) => m[id];
  }, [sucursales.data]);

  /** Cantidad en una coordenada exacta. */
  const cantidad = (productoId, sucursalId, presentacionId = null, estado = "disponible") => {
    const f = (stock.data || []).find((s) => s.productoId === productoId && s.sucursalId === sucursalId && (s.presentacionId ?? null) === (presentacionId ?? null) && s.estado === estado);
    return f ? Number(f.cantidad) : 0;
  };

  return { productos, sucursales, stock, productoDe, sucursalDe, cantidad, cargando: productos.isLoading || sucursales.isLoading || stock.isLoading };
};
