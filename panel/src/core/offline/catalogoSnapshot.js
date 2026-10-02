/**
 * FOTO DEL CATÁLOGO — la última respuesta buena de `GET /ventas/catalogo`
 * (precios y stock) de cada sucursal, guardada en IndexedDB.
 *
 * El POS ya trae el catálogo una vez por sesión y lo guarda en memoria — eso
 * alcanza mientras la pestaña sigue abierta. El problema es un F5 (o el
 * navegador recargando la pestaña solo) justo durante un corte: sin esta
 * foto, el POS se queda sin nada para vender hasta que vuelva internet,
 * aunque el corte dure solo un minuto más. Con la foto, arranca con la
 * última que se conoce y sigue vendiendo.
 */
import { put, obtener } from './db.js';

const CAJON = 'catalogoSnapshot';

/** Se llama cada vez que `GET /ventas/catalogo` responde bien — mientras haya conexión, se va actualizando sola. */
export async function guardarSnapshot(sucursalId, datos) {
  await put(CAJON, { sucursalId, datos, guardadoEn: Date.now() });
}

/** La última foto conocida de esa sucursal, o `null` si nunca se guardó ninguna (dispositivo nuevo, primera vez). */
export async function leerSnapshot(sucursalId) {
  const fila = await obtener(CAJON, sucursalId);
  return fila?.datos ?? null;
}
