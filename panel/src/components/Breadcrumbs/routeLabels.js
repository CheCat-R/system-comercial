/**
 * Las etiquetas de la miga de pan, sin JSX.
 *
 * Viven aparte del componente por una razón práctica: un archivo que exporta un
 * componente **y** funciones sueltas rompe el refresco en caliente de Vite
 * (`react-refresh/only-export-components`). El panel ya arrastra ese aviso en
 * sus cuatro contextos; no hacía falta sumar un quinto por unas constantes.
 */
import { NAV_DESTINATIONS } from "../../app/navigation";

/**
 * Etiquetas de segmentos que **no son un destino del menú**: sub-secciones,
 * verbos de una URL, y las palabras que el menú abrevia.
 */
const EXTRA_NAMES = {
  nuevo: "Nuevo",
  nueva: "Nueva",
  detalle: "Detalle",
  editar: "Editar",
  compras: "Compras",
  metricas: "Diccionario de métricas",
  historial: "Historial",
  eventos: "Bandeja de eventos",
  contenido: "Contenido",
  trafico: "Consola de tráfico",
  webhooks: "Entrantes",
  "info-sistema": "Información del Sistema",
};

/**
 * ⭐ La etiqueta se busca por **ruta completa**, no por último segmento.
 *
 * Indexar por segmento parecía más simple y estaba mal: el submenú de Marketing
 * tiene un hijo «Resumen» que apunta a `/marketing`, así que el segmento
 * `marketing` quedaba mapeado a «Resumen» y la miga decía
 * «Inicio › Resumen › Campañas». La ruta acumulada no tiene esa ambigüedad.
 */
const NAV_BY_PATH = Object.fromEntries(
  NAV_DESTINATIONS.map((d) => {
    // ⭐ La raíz de un módulo se llama como el módulo, no como su primer ítem.
    // En el menú, `/marketing` es el hijo «Resumen» de «Marketing»: dentro del
    // submenú eso se entiende, pero en la miga «Inicio › Resumen › Campañas» no
    // dice de qué Resumen se trata.
    const esRaizDeModulo = d.parent && d.path.split("/").filter(Boolean).length === 1;
    return [d.path, esRaizDeModulo ? d.parent : d.label];
  })
);

/** Y por segmento, sólo como respaldo para sub-rutas que el menú no lista. */
const NAV_NAMES = (() => {
  const out = {};
  NAV_DESTINATIONS.forEach((d) => {
    const parts = d.path.split("/").filter(Boolean);
    const seg = parts[parts.length - 1];
    // Un destino de un solo segmento (`/marketing`) NO nombra a su segmento:
    // ése es el nombre del módulo, y lo pone el menú por su ruta completa.
    if (parts.length > 1 && seg && !out[seg]) out[seg] = d.label;
  });
  return out;
})();

/** El nombre del módulo, para el primer segmento de la ruta. */
const MODULE_NAMES = Object.fromEntries(
  NAV_DESTINATIONS.filter((d) => d.parent).map((d) => [d.path.split("/")[1], d.parent])
);

const isId = (value) =>
  /^\d+$/.test(value) || /^[A-Za-z]{2,4}-?\d+$/i.test(value) || value.length > 18 || value.includes(".");

/**
 * @param {string} value  el segmento
 * @param {string} path   la ruta acumulada hasta ese segmento
 */
export const labelFor = (value, path) =>
  (path && NAV_BY_PATH[path])
  || EXTRA_NAMES[value]
  || MODULE_NAMES[value]
  || NAV_NAMES[value]
  || (isId(value) ? null : value.charAt(0).toUpperCase() + value.slice(1));

/**
 * ⭐ Qué segmentos de ruta no tiene nombre nadie.
 *
 * Corre en desarrollo, igual que los demás contratos del panel: una ruta se
 * puede agregar sin su etiqueta y nada se rompe — pero ahora tampoco pasa
 * inadvertido.
 */
export const assertRoutes = (paths = []) => {
  const missing = new Set();
  paths.forEach((p) => {
    p.split("/").filter(Boolean).forEach((seg) => {
      if (isId(seg)) return;
      if (!EXTRA_NAMES[seg] && !NAV_NAMES[seg]) missing.add(seg);
    });
  });
  return [...missing];
};

/** ¿Alguien le puso nombre a este segmento? (el menú o el mapa local) */
export const isNamed = (value, path) =>
  Boolean((path && NAV_BY_PATH[path]) || EXTRA_NAMES[value] || MODULE_NAMES[value] || NAV_NAMES[value])
  || isId(value);
