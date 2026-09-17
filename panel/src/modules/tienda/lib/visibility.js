/**
 * Visibilidad compartida por Sección, Bloque y Banner.
 *
 * El mismo objeto en los tres niveles: fecha + audiencia + dispositivo. Se evalúa
 * contra un "contexto de vista" (`ViewAs`) que el editor deja elegir y que el
 * storefront real armaría con el visitante de turno.
 *
 * Ver docs/MODULO-TIENDA-CMS.md §8.3.
 */
import { TODAY } from "./time";

export const VISIBILITY_MODES = [
  { value: "always", label: "Siempre visible" },
  { value: "scheduled", label: "Programada", hint: "Entre dos fechas" },
  { value: "audience", label: "Por audiencia", hint: "Sólo a un segmento" },
  { value: "hidden", label: "Oculta", hint: "No se publica" },
];

export const DEVICES = [
  { value: "desktop", label: "Escritorio" },
  { value: "tablet", label: "Tablet" },
  { value: "mobile", label: "Mobile" },
];

export const DEFAULT_VISIBILITY = { mode: "always" };

/** Contexto de vista por defecto: hoy, todo el público, escritorio. */
export const defaultViewAs = () => ({
  at: TODAY.toISOString().slice(0, 10),
  audienceId: null,
  device: "desktop",
});

const inWindow = (at, startsAt, endsAt) => {
  const t = new Date(at).getTime();
  if (startsAt && t < new Date(startsAt).getTime()) return false;
  if (endsAt && t > new Date(endsAt).getTime()) return false;
  return true;
};

/**
 * ¿Se ve este nodo en este contexto?
 * @returns {{ visible: boolean, reason: string|null }}
 */
export const evaluateVisibility = (visibility, viewAs = defaultViewAs()) => {
  const v = { ...DEFAULT_VISIBILITY, ...(visibility || {}) };

  if (v.mode === "hidden") return { visible: false, reason: "Oculta manualmente" };

  if (v.devices?.length && !v.devices.includes(viewAs.device)) {
    return { visible: false, reason: `Sólo en ${v.devices.join(" / ")}` };
  }

  if (v.mode === "scheduled" && !inWindow(viewAs.at, v.startsAt, v.endsAt)) {
    return { visible: false, reason: "Fuera de la ventana programada" };
  }

  if (v.mode === "audience") {
    if (!v.audienceId) return { visible: false, reason: "Sin audiencia asignada" };
    if (viewAs.audienceId !== v.audienceId) {
      return { visible: false, reason: "Otra audiencia" };
    }
    if (!inWindow(viewAs.at, v.startsAt, v.endsAt)) {
      return { visible: false, reason: "Fuera de la ventana programada" };
    }
  }

  return { visible: true, reason: null };
};

/** Etiqueta corta para el outline del editor. `null` si no hay nada que avisar. */
export const visibilityBadge = (visibility) => {
  const v = { ...DEFAULT_VISIBILITY, ...(visibility || {}) };
  if (v.mode === "hidden") return { label: "Oculta", tone: "neutral" };
  if (v.mode === "audience") return { label: "Segmentada", tone: "info" };
  if (v.mode === "scheduled") return { label: "Programada", tone: "warning" };
  if (v.devices?.length && v.devices.length < DEVICES.length) {
    return { label: v.devices.length === 1 ? DEVICES.find((d) => d.value === v.devices[0])?.label : "Por dispositivo", tone: "neutral" };
  }
  return null;
};
