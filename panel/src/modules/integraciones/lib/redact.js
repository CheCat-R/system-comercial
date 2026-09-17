/**
 * Redacción de payloads para el log (§2.9).
 *
 * **La lista la declara el contrato del proveedor, no la UI.** Un log que guarda
 * de más es una filtración esperando; uno que guarda de menos no sirve para
 * diagnosticar. Que lo declare el contrato lo vuelve revisable en un solo lugar.
 *
 * Se redacta **al leer**, no al guardar: si se guardara ya redactado, no se
 * podría reintentar la llamada con el payload original.
 */

const MASK = "•••";

/** Campos que se enmascaran siempre, los declare o no el proveedor. */
export const ALWAYS_REDACT = [
  "password", "secret", "token", "apiKey", "api_key", "authorization",
  "cvv", "cvc", "pan", "cardNumber", "card_number", "certificate",
];

const looksSensitive = (key) =>
  ALWAYS_REDACT.some((s) => String(key).toLowerCase().includes(s.toLowerCase()));

/** Deja los últimos 4, que es lo que sirve para reconocer sin exponer. */
const mask = (value) => {
  const s = String(value ?? "");
  if (s.length <= 4) return MASK;
  return `${MASK}${s.slice(-4)}`;
};

const redactPath = (obj, path) => {
  const parts = String(path).split(".");
  const last = parts.pop();
  let cursor = obj;
  parts.forEach((p) => { cursor = cursor?.[p]; });
  if (cursor && last in cursor) cursor[last] = mask(cursor[last]);
};

/**
 * Copia el payload con los campos sensibles enmascarados.
 *
 * @param {object} payload
 * @param {string[]} declared rutas que el contrato manda redactar
 */
export const redact = (payload, declared = []) => {
  if (payload == null || typeof payload !== "object") return payload;

  const clone = JSON.parse(JSON.stringify(payload));

  // 1. lo que declara el proveedor
  declared.forEach((path) => redactPath(clone, path));

  // 2. la red de seguridad: nombres que son sensibles por sí mismos, a
  //    cualquier profundidad. Si el contrato se olvidó de uno, igual no sale.
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    Object.keys(node).forEach((k) => {
      if (looksSensitive(k)) node[k] = mask(node[k]);
      else walk(node[k]);
    });
  };
  walk(clone);

  return clone;
};

/** Para mostrar en pantalla, ya redactado y legible. */
export const previewPayload = (payload, declared = []) => {
  try {
    return JSON.stringify(redact(payload, declared), null, 2);
  } catch {
    return "(no se pudo serializar)";
  }
};
