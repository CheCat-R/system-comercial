/**
 * ⭐ Idempotencia (§2.8).
 *
 * La regla de oro del módulo: **la clave se deriva del hecho de dominio
 * (`pedido:10253:charge`), nunca del intento.** Sin eso, el reintento automático
 * de un cobro cobra dos veces — y como el reintento es automático, un módulo sin
 * esto sería peligroso por diseño.
 *
 * ── ⭐ Dónde NO se aplica ────────────────────────────────────────────────
 *
 * Sólo llevan clave las operaciones que **son un hecho**: las que el catálogo
 * declara con `idempotencyKey` en su `input` (`payments.charge`,
 * `payments.refund`) o las que la pasan explícitamente. Una consulta —la
 * comisión de un pedido, el estado de un envío— no lleva clave, y está bien:
 * repetirla no duplica nada, y guardar su resultado para siempre haría que el
 * panel mostrara un número viejo con cara de nuevo.
 *
 * ── ⭐ La garantía se declara, no se promete ────────────────────────────
 *
 * Si el proveedor soporta idempotencia nativa, la garantía es suya. Si no, la
 * simula el panel guardando el resultado por clave — y eso es **más débil**:
 * sólo vale para esta sesión y sólo para los intentos que pasan por acá. La
 * ficha lo dice en vez de esconderlo.
 */

/** `clave → { result, at, callId, portKey }`. En memoria, como todo el panel. */
let _store = new Map();

export const recall = (key) => (key ? _store.get(key) || null : null);

export const remember = (key, entry) => {
  if (!key) return null;
  const row = { key, at: new Date().toISOString(), ...entry };
  _store.set(key, row);
  return row;
};

export const forget = (key) => { _store.delete(key); };

export const listKeys = () =>
  [..._store.values()].sort((a, b) => new Date(b.at) - new Date(a.at));

export const clearIdempotency = () => { _store = new Map(); };

/**
 * Cómo se está garantizando, para poder decirlo en la ficha.
 * El proveedor lo declara con `idempotent: true` en su contrato.
 */
export const guaranteeOf = (provider) => (provider?.idempotent
  ? {
    key: "nativa",
    label: "Idempotencia nativa del proveedor",
    tone: "success",
    hint: "El proveedor acepta la clave y garantiza que un reintento no repite el efecto.",
  }
  : {
    key: "simulada",
    label: "Idempotencia simulada por el panel",
    tone: "warning",
    hint: "El proveedor no la declara: el panel guarda el resultado por clave y no vuelve a llamar. Es una garantía más débil — vale para esta sesión y sólo para lo que pasa por el registro de puertos.",
  });

/**
 * La clave que corresponde a una llamada, o `null` si esta operación no es un
 * hecho de dominio. Se busca en tres lugares, en orden de autoridad:
 *
 *   1. la que pasó el módulo que llama (`meta.idempotencyKey`)
 *   2. la que viaja en el payload, porque el puerto la declara en su `input`
 *   3. ninguna
 */
export const keyFor = (payload, meta = {}) =>
  meta.idempotencyKey || payload?.idempotencyKey || null;
