/**
 * ⭐ Credenciales: el panel no guarda secretos (§2.5).
 *
 * **Decisión dura: ningún campo marcado `secret` se persiste.** Ni en el estado
 * del módulo, ni en `localStorage`, ni en un mock "que después se cambia".
 *
 * Lo que queda es una **referencia**: de dónde tendría que leerlo el backend, y
 * los últimos 4 caracteres para que una persona reconozca cuál cargó. El valor
 * se descarta en el mismo momento en que se arma la referencia — este archivo no
 * tiene ninguna variable donde pueda quedar.
 *
 * Consecuencia asumida, y la UI la dice con todas las letras: en el estado
 * actual del proyecto —front-end sin backend— **el modo producción no se puede
 * completar desde el panel**. Fingir lo contrario sería enseñar un patrón que
 * después se copia a producción, y el módulo entero existe para poner la
 * frontera en su lugar, no para agujerearla en el primer campo de texto.
 */

const MASK = "•••";

/** Últimos 4, que es lo que sirve para reconocer sin exponer. */
const tail = (value) => {
  const s = String(value ?? "");
  return s.length <= 4 ? MASK : `${MASK}${s.slice(-4)}`;
};

/**
 * Convierte los valores secretos de un formulario en referencias, y **devuelve
 * la configuración sin ellos**.
 *
 * @param {object} values   lo que cargó el usuario
 * @param {Array}  schema   campos del contrato del proveedor
 * @returns {{ config, secretsRef, provided }}
 */
export const extractSecrets = (values = {}, schema = []) => {
  const config = {};
  const secretsRef = {};
  let provided = 0;

  schema.forEach((field) => {
    const value = values[field.key];

    if (field.type !== "secret") {
      if (value !== undefined) config[field.key] = value;
      return;
    }

    // ⭐ Acá muere el valor: se guarda de dónde vendría y cómo se reconoce.
    if (value != null && String(value).length > 0) {
      provided += 1;
      secretsRef[field.key] = {
        ref: `env:${field.key.toUpperCase()}`,
        hint: tail(value),
        setAt: new Date().toISOString(),
      };
    }
  });

  return { config, secretsRef: Object.keys(secretsRef).length ? secretsRef : null, provided };
};

/** Campos secretos que el contrato pide y todavía no tienen referencia. */
export const missingSecrets = (schema = [], secretsRef = null) =>
  schema
    .filter((f) => f.type === "secret" && f.required !== false)
    .filter((f) => !secretsRef?.[f.key])
    .map((f) => f.label || f.key);

/**
 * ¿Se puede pasar a producción? En este proyecto, nunca — y el motivo se
 * devuelve para mostrarlo, en vez de deshabilitar un botón sin explicación.
 */
export const canGoLive = (schema = []) => {
  const needsSecret = schema.some((f) => f.type === "secret");
  if (!needsSecret) return { ok: true, reason: null };
  return {
    ok: false,
    reason:
      "El panel no guarda secretos y no hay backend que los custodie, así que la credencial nunca " +
      "llega al proveedor. Sandbox y simulado sí funcionan; producción necesita el servidor.",
  };
};

export const describeRef = (entry) =>
  entry ? `${entry.ref} · termina en ${entry.hint}` : "sin cargar";
