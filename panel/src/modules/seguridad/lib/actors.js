/**
 * ⭐ Quién puede ser un actor (§3).
 *
 * **Una persona, una automatización o una integración.** Es la decisión que hace
 * que la auditoría del panel sea verdadera en vez de parcial: sin esto, el día
 * que una regla cancele un pedido o un webhook confirme un pago, el rastro diría
 * *"sistema"* — que es la forma elegante de decir *no sabemos*.
 *
 * Hoja sin imports: la usan el shell, el motor y el puente.
 *
 * @sin-dependencias  Verificado por scripts/verificar-arquitectura.mjs:
 *                    este archivo NO puede tener ni un `import`.
 */

export const ACTOR_KINDS = {
  user: {
    key: "user", label: "Persona", tone: "info", icon: "person",
    hint: "Alguien con sesión abierta en el panel.",
  },
  automation: {
    key: "automation", label: "Automatización", tone: "warning", icon: "bolt",
    hint: "Una regla del motor. Actuó sola, pero por el mismo camino que una persona.",
  },
  integration: {
    key: "integration", label: "Integración", tone: "success", icon: "hub",
    hint: "Entró de afuera y se tradujo a un hecho de dominio. El `ref` lleva al evento del proveedor.",
  },
  sistema: {
    key: "sistema", label: "Sistema", tone: "neutral", icon: "settings",
    hint: "⚠ Nadie declaró quién fue. Si aparece seguido, hay un camino de escritura sin actor.",
  },
};

export const getActorKind = (key) => ACTOR_KINDS[key] || ACTOR_KINDS.sistema;

/** Actor persona, a partir del usuario de la sesión. */
export const userActor = (user) => (user ? {
  kind: "user",
  id: user.id,
  name: user.name,
  role: user.roleKey || user.role || null,
  email: user.email || null,
} : null);

/** Actor automatización: la regla que ejecuta, no "el motor". */
export const automationActor = (rule) => ({
  kind: "automation",
  id: rule?.id || "regla",
  name: rule?.name || "Automatización",
  role: null,
});

/**
 * Actor integración: la **conexión**, con la referencia del evento del proveedor
 * para poder ir del asiento a la llamada exacta en la consola de tráfico.
 */
export const integrationActor = (portKey, ref = null) => ({
  kind: "integration",
  id: portKey,
  name: portKey,
  role: null,
  ref,
});

export const describeActor = (actor) => {
  if (!actor) return "Sistema";
  const kind = getActorKind(actor.kind);
  if (actor.kind === "user") return actor.name;
  return `${actor.name} (${kind.label.toLowerCase()})`;
};
