/**
 * ⭐ Cómo se entera la miga de pan del nombre de una entidad.
 *
 * `Pedidos > Detalle` no le dice nada a nadie. `Pedidos > #10253` sí, y la
 * pantalla de detalle **ya tiene el pedido cargado** — el dato existe, sólo que
 * en el componente equivocado.
 *
 * Este contexto es el canal: la pantalla de detalle registra "el id X se llama
 * Y" cuando lo sabe, y la miga lo consulta al pintar. Sin pedirle nada a ningún
 * `api/` (la miga no debería saber qué es un pedido) y sin poner el nombre en la
 * URL.
 *
 *   const { setLabel } = useEntityLabel();
 *   useEffect(() => setLabel(order.id, `#${order.id}`), [order.id]);
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

const EntityLabelContext = createContext({ labelOf: () => null, setLabel: () => {} });

export const useEntityLabel = () => useContext(EntityLabelContext);

export const EntityLabelProvider = ({ children }) => {
  // Se guarda en un ref además del estado: el `labelOf` que lee la miga tiene
  // que ver el valor recién registrado aunque el re-render todavía no ocurra.
  const map = useRef(new Map());
  const [version, bump] = useState(0);

  const setLabel = useCallback((id, label) => {
    if (!id || !label) return;
    if (map.current.get(String(id)) === label) return;
    map.current.set(String(id), label);
    bump((n) => n + 1);
  }, []);

  const labelOf = useCallback((id) => map.current.get(String(id)) || null, []);

  /**
   * ⭐ `version` está en las dependencias y no se usa adentro, y no es un
   * descuido: es lo único que hace que este objeto cambie de identidad.
   *
   * Sin él, registrar un nombre re-renderizaba el provider pero **entregaba el
   * mismo objeto de contexto**, así que ningún consumidor se enteraba y la miga
   * seguía diciendo «Detalle». Encontrado en pantalla: funcionaba al navegar
   * dentro de la app (donde la miga re-renderiza igual, por el cambio de ruta) y
   * fallaba al entrar directo por la URL.
   */
  const value = useMemo(() => ({ labelOf, setLabel, version }), [labelOf, setLabel, version]);

  return <EntityLabelContext.Provider value={value}>{children}</EntityLabelContext.Provider>;
};
