import { useCallback, useRef, useState } from 'react';

/**
 * UNA OPERACIÓN A LA VEZ. Devuelve `[ejecutar, enCurso]`: `ejecutar(fn)` corre `fn` (que tiene que DEVOLVER la
 * promesa) y descarta los llamados que lleguen mientras la anterior sigue en vuelo; `enCurso` sirve para apagar el botón.
 *
 * Va con una REF y no solo con el estado: el segundo clic de un doble clic llega antes de que React vuelva a
 * pintar con el botón apagado. Sin esto, cada clic mandaba su propio pedido (dos facturas, dos ajustes de stock,
 * dos pagos).
 */
export function useUnaVez() {
  const ocupado = useRef(false);
  const [enCurso, setEnCurso] = useState(false);
  const ejecutar = useCallback(async (fn) => {
    if (ocupado.current) return undefined;
    ocupado.current = true;
    setEnCurso(true);
    try {
      return await fn();
    } finally {
      ocupado.current = false;
      setEnCurso(false);
    }
  }, []);
  return [ejecutar, enCurso];
}