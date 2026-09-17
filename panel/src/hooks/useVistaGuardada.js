/**
 * ⭐ Filtros que sobreviven a navegar, y vistas que se pueden guardar y pasar.
 *
 * El panel ya resolvía esto **una vez**: `clientsApi` guardaba vistas del CRM en
 * `localStorage` (`checat_crm_views`), probado y funcionando. Las otras 81
 * pantallas tenían 27 estados de filtro que se perdían al salir, y sólo 7 ponían
 * algo en la URL.
 *
 * Esto sube ese mecanismo a un hook compartido y le agrega la mitad que faltaba:
 *
 * ── ⭐ Los filtros van en la URL ────────────────────────────────────────
 *
 * No es sólo para que sobrevivan a ir y volver. Es para que el estado de una
 * pantalla **se pueda pasar por link**: en un ERP, "miralo vos, te paso el link"
 * ocurre todo el día, y hoy el link llevaba a la pantalla sin filtrar. La URL es
 * el único lugar donde un estado de UI es compartible.
 *
 * ── Qué NO va a la URL ─────────────────────────────────────────────────
 *
 * Lo que está vacío. Una URL con `?search=&estado=&categoria=` no dice nada más
 * que `/productos` y ensucia el historial del navegador.
 *
 *   const [filtros, setFiltros, vistas] = useVistaGuardada("productos", {
 *     search: "", categoria: "", estado: "",
 *   });
 */
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

const KEY = (scope) => `checat_vistas_${scope}`;

const leer = (scope) => {
  try {
    return JSON.parse(localStorage.getItem(KEY(scope)) || "[]");
  } catch {
    return [];
  }
};

const escribir = (scope, vistas) => {
  try {
    localStorage.setItem(KEY(scope), JSON.stringify(vistas));
  } catch {
    /* almacenamiento bloqueado: las vistas son una conveniencia, no un dato */
  }
  return vistas;
};

/**
 * @param {string} scope   con qué nombre se guardan las vistas de esta pantalla
 * @param {object} inicial forma y valores por defecto de los filtros
 */
export const useVistaGuardada = (scope, inicial = {}) => {
  const [params, setParams] = useSearchParams();

  /** Los filtros salen de la URL; lo que no está ahí toma el valor por defecto. */
  const filtros = useMemo(() => {
    const out = { ...inicial };
    Object.keys(inicial).forEach((k) => {
      const v = params.get(k);
      if (v == null) return;
      // El tipo lo dicta el valor por defecto: si arrancó en número, vuelve número.
      out[k] = typeof inicial[k] === "number" ? Number(v) : v;
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const setFiltros = useCallback((cambios) => {
    const siguiente = { ...filtros, ...cambios };
    const next = new URLSearchParams(params);

    Object.entries(siguiente).forEach(([k, v]) => {
      const vacio = v === "" || v == null || v === inicial[k];
      if (vacio) next.delete(k);
      else next.set(k, String(v));
    });

    // `replace` para no llenar el historial: veinte teclas en el buscador no son
    // veinte pasos atrás.
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros, params, setParams]);

  const limpiar = useCallback(() => {
    const next = new URLSearchParams(params);
    Object.keys(inicial).forEach((k) => next.delete(k));
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, setParams]);

  const hayFiltro = useMemo(
    () => Object.keys(inicial).some((k) => filtros[k] !== inicial[k]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtros]
  );

  /* ------------------------------------------------------------ vistas */

  const vistas = leer(scope);

  const guardarVista = useCallback((nombre) => {
    const limpio = {};
    Object.entries(filtros).forEach(([k, v]) => { if (v !== inicial[k]) limpio[k] = v; });
    return escribir(scope, [
      ...leer(scope).filter((v) => v.nombre !== nombre),
      { id: `V-${Date.now()}`, nombre, filtros: limpio },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros, scope]);

  const aplicarVista = useCallback((vista) => {
    const next = new URLSearchParams(params);
    Object.keys(inicial).forEach((k) => next.delete(k));
    Object.entries(vista.filtros).forEach(([k, v]) => next.set(k, String(v)));
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, setParams]);

  const borrarVista = useCallback(
    (id) => escribir(scope, leer(scope).filter((v) => v.id !== id)),
    [scope]
  );

  return { filtros, setFiltros, limpiar, hayFiltro, vistas, guardarVista, aplicarVista, borrarVista };
};

export default useVistaGuardada;
