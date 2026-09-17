/**
 * Carga del sujeto y armado del contexto de evaluación.
 *
 * El **sujeto** es la entidad sobre la que actúa una regla (§2.1). Acá se lo
 * carga desde el `api/` de su módulo dueño y se lo aplana en un objeto de
 * campos, que es lo que consumen las condiciones y las plantillas de texto
 * (`{{order.total}}`).
 *
 * **Se carga en el momento de evaluar, no cuando se emitió el evento.** Un
 * trabajo diferido 24 h se creó con un mundo que ya no existe: al vencer hay que
 * mirar el estado de ahora (§2.4). Por eso el contexto se arma acá y no viaja
 * dentro del evento.
 *
 * ⭐ **Cómo llega acá el `api/` de cada módulo:** no por import. Cada módulo
 * dueño registra su tipo de sujeto con `registrarSujeto()` (ver `registry.js`).
 * Este archivo sabe *cómo se arma un contexto*; no sabe que existen los pedidos.
 */
import { now } from "./clock";
import { sujeto, extensionesDe } from "./registry";

const safe = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };

const hoursSince = (iso) => (iso ? (now().getTime() - new Date(iso).getTime()) / 3_600_000 : null);
const daysSince = (iso) => { const h = hoursSince(iso); return h == null ? null : h / 24; };

/** Lo que recibe cada módulo para cargar y derivar sin reimplementar el reloj. */
export const HELPERS = { safe, hoursSince, daysSince, now };

/**
 * Arma el contexto de un sujeto: las entidades cargadas más el contexto
 * temporal. Devuelve `null` si el sujeto ya no existe — que es un resultado
 * legítimo, no un error: entre que se encoló el trabajo y venció, alguien pudo
 * borrar el pedido. Y también devuelve `null` si el tipo no está registrado,
 * que en un panel armado a medida significa «ese módulo no está en este
 * proyecto» (el motor lo explica, no se cae).
 */
export const buildContext = (subject, event = null) => {
  if (!subject?.type) return null;
  const def = sujeto(subject.type);
  if (!def) return null;

  const base = safe(() => def.cargar(subject.id, HELPERS));
  if (!base) return null;

  // Lo que otros módulos le agregan a este sujeto (la cuenta de un pedido, por
  // ejemplo). Si el módulo que extendía no está en el proyecto, simplemente no
  // hay extensión — y tampoco están sus condiciones.
  const loaded = extensionesDe(subject.type).reduce(
    (acc, extender) => ({ ...acc, ...(safe(() => extender(acc, HELPERS)) || {}) }),
    base
  );

  const at = now();
  return {
    ...loaded,
    subject,
    event,
    // Campos derivados que varias condiciones necesitan y que no vale la pena
    // recalcular en cada una. Los aporta el módulo dueño, porque son suyos:
    // «horas desde el despacho» es una idea de Logística, no del motor.
    derived: safe(() => def.derivar?.(loaded, HELPERS), {}) || {},
    context: {
      weekday: at.getDay(),
      hour: at.getHours(),
      isWorkday: at.getDay() >= 1 && at.getDay() <= 5,
    },
  };
};

/** Etiqueta legible del sujeto, para la lista y el historial. */
export const describeSubject = (subject, ctx = null) => {
  if (!subject) return "—";
  const c = ctx || buildContext(subject);
  if (!c) return `${subject.id} (ya no existe)`;
  const def = sujeto(subject.type);
  return safe(() => def?.describir?.(subject, c)) || subject.id;
};

/**
 * Reemplaza `{{ruta.campo}}` en un texto con valores del contexto.
 * Lo usan los títulos de tarea y los mensajes de notificación.
 */
export const interpolate = (text = "", ctx) => {
  if (!text || !ctx) return text;
  return String(text).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, path) => {
    const value = path.split(".").reduce((acc, part) => (acc == null ? acc : acc[part]), ctx);
    return value == null ? match : String(value);
  });
};
