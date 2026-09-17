/**
 * ⭐ El efecto de lo que entra (§5, regla 3).
 *
 * **Integraciones no escribe en el dominio.** Un `pago.acreditado` termina
 * llamando a `pedidosApi.confirmPayment`, con sus validaciones intactas: si el
 * pedido ya no está pendiente, el `api/` dice que no y el webhook queda
 * registrado como "traducido, efecto rechazado". Eso es exactamente lo que
 * queremos ver — el módulo dueño sigue siendo el dueño.
 *
 * ── ⭐ El hallazgo: traducir y además emitir duplica el evento ───────────
 *
 * La secuencia de §5 dice "publicar al bus" y después "el módulo dueño
 * escribe". Al implementarlo aparece que esas dos cosas, hechas literalmente,
 * emiten el evento **dos veces**: `confirmPayment` ya emite `pedido.pagado` al
 * final. El motor de Automatizaciones despertaría dos veces por el mismo hecho.
 *
 * Así que la regla queda más filosa de lo que estaba escrita: **el que publica
 * el evento de dominio es el módulo dueño, no Integraciones.** Cuando el `api/`
 * del dueño no emite nada (`emits: false`), recién ahí lo emite el puente — y la
 * ficha del webhook dice cuál de las dos cosas pasó.
 */
import { confirmPayment, rejectPayment } from "../../pedidos/api/pedidosApi";
import { markShipmentDelivered } from "../../logistica/api/logisticaApi";

export const EFFECTS = {
  "pedido.pagado": {
    label: "Confirmar el pago del pedido",
    owner: "pedidosApi.confirmPayment",
    emits: true,
    apply: ({ subject }) => confirmPayment(subject.id),
  },
  "pedido.pago_rechazado": {
    label: "Marcar el pago como rechazado",
    owner: "pedidosApi.rejectPayment",
    emits: true,
    apply: ({ subject, payload }) => rejectPayment(subject.id, { reason: payload?.reason }),
  },
  "envio.entregado": {
    label: "Marcar el envío como entregado",
    owner: "logisticaApi.markShipmentDelivered",
    emits: true,
    apply: ({ subject }) => markShipmentDelivered(subject.id),
  },
};

export const getEffect = (eventKey) => EFFECTS[eventKey] || null;

/**
 * Aplica el efecto. Nunca tira: un webhook que rompe la pantalla es peor que un
 * webhook que quedó registrado con su motivo.
 */
export const applyEffect = (eventKey, { subject, payload }) => {
  const effect = getEffect(eventKey);
  if (!effect) {
    return {
      ok: false,
      applied: false,
      emits: false,
      message: "Ningún módulo declara qué hacer con este evento: se publicó al bus y ahí queda.",
    };
  }
  try {
    effect.apply({ subject, payload });
    return { ok: true, applied: true, emits: effect.emits, owner: effect.owner, message: `${effect.label} · ${effect.owner}` };
  } catch (err) {
    return {
      ok: false, applied: false, emits: effect.emits, owner: effect.owner,
      message: `El módulo dueño lo rechazó: ${err.message}`,
    };
  }
};
