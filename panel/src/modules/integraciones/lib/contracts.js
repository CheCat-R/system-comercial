/**
 * ⭐ El contrato de un proveedor (§2.2).
 *
 * **Los siete puntos que define el módulo son, literalmente, el contrato.** Un
 * proveedor que no los declara no se puede conectar, y `assertProviderContracts`
 * lo hace cumplir al cargar — el mismo mecanismo que `assertContracts()` en
 * Analytics y `assertEventContracts()` en Automatizaciones.
 *
 *   1 input     qué información entra
 *   2 output    qué información sale, **ya en el modelo del panel**
 *   3 events    qué publica y qué eventos de dominio produce al recibir
 *   4 config    schema de configuración, con los campos secretos marcados
 *   5 state     cómo se sabe si está sano (healthCheck)
 *   6 errors    mapa del proveedor → taxonomía del panel, con su política
 *   7 logs      qué se registra y **qué se redacta**
 *
 * En `providers/` **no hay ninguna integración concreta**: sólo un doble de
 * prueba (`_demo.js`) para poder ejercitar el marco. El validador existe para
 * que el día que se escriba un adaptador real no se pueda conectar a medias.
 */
import { getPort } from "./catalog";
import { ERROR_TYPES } from "./errors";

/** Los siete, más los descriptivos. */
const REQUIRED = ["key", "label", "port", "input", "output", "events", "config", "state", "errors", "logs"];

/** Tipos de campo admitidos en el schema de configuración. */
export const CONFIG_FIELD_TYPES = ["text", "number", "select", "switch", "secret", "url"];

/**
 * Verifica un contrato. Devuelve la lista de problemas: vacía = se puede
 * conectar.
 */
export const validateProvider = (provider) => {
  const problems = [];
  const id = provider?.key || "(sin key)";

  REQUIRED.forEach((field) => {
    if (provider?.[field] == null) problems.push(`${id}: falta «${field}»`);
  });
  if (problems.length) return problems;

  // --- ⭐ un proveedor universal («*») sólo puede ser un doble de prueba ---
  // Un adaptador real implementa un puerto concreto: si dice servir a todos, o
  // está mal declarado o es una herramienta de prueba. Se admite lo segundo, y
  // sólo si lo dice.
  if (provider.port === "*") {
    if (!provider.demo) {
      problems.push(`${id}: declara servir a todos los puertos («*») sin ser un doble de prueba.`);
    }
    return problems;
  }

  // --- el puerto tiene que existir ---
  const port = getPort(provider.port);
  if (!port) {
    problems.push(`${id}: el puerto «${provider.port}» no está en el catálogo.`);
    return problems;
  }

  // --- ⭐ el output del proveedor tiene que cubrir el del puerto ---
  // Si no puede devolver todo lo que el núcleo espera, no puede implementar ese
  // puerto: antes que un objeto a medias, no se conecta.
  Object.keys(port.output).forEach((field) => {
    if (!(field in provider.output)) {
      problems.push(`${id}: no devuelve «${field}», que el puerto «${port.key}» necesita.`);
    }
  });

  // --- configuración ---
  (provider.config || []).forEach((f) => {
    if (!f.key) problems.push(`${id}: un campo de configuración no tiene «key».`);
    if (!CONFIG_FIELD_TYPES.includes(f.type)) {
      problems.push(`${id}: el campo «${f.key}» usa un tipo desconocido («${f.type}»).`);
    }
    // ⭐ Un secreto no puede tener valor por defecto: sería un secreto en el repo.
    if (f.type === "secret" && f.default != null) {
      problems.push(`${id}: el campo secreto «${f.key}» trae un valor por defecto. Un secreto no se versiona.`);
    }
  });

  // --- errores: el mapa tiene que apuntar a la taxonomía del panel ---
  Object.entries(provider.errors || {}).forEach(([remote, type]) => {
    if (!ERROR_TYPES[type]) {
      problems.push(`${id}: mapea «${remote}» a «${type}», que no es un tipo de error del panel.`);
    }
  });

  // --- salud ---
  if (typeof provider.state?.healthCheck !== "function") {
    problems.push(`${id}: «state» no expone healthCheck().`);
  }

  // --- logs: la redacción tiene que nombrar campos que existan ---
  const known = new Set([...Object.keys(provider.input || {}), ...Object.keys(provider.output || {})]);
  (provider.logs?.redact || []).forEach((path) => {
    const root = String(path).split(".")[0];
    if (!known.has(root)) {
      problems.push(`${id}: declara redactar «${path}», que no está ni en input ni en output.`);
    }
  });

  // --- ⭐ un puerto syncOnly no admite un proveedor asíncrono ---
  if (port.syncOnly && provider.async) {
    problems.push(
      `${id}: el puerto «${port.key}» es syncOnly (lo consume una pantalla al renderizar) y este proveedor es asíncrono. Antes hay que guardar el dato en el dominio.`
    );
  }

  return problems;
};

/* --------------------------------------------------------- registro */

const _providers = new Map();

/** Registra un proveedor en el catálogo del módulo (no lo conecta). */
export const defineProvider = (provider) => {
  _providers.set(provider.key, provider);
  return provider;
};

/** Un proveedor universal («*», sólo dobles de prueba) sirve para cualquier puerto. */
export const listProviders = ({ port } = {}) =>
  [..._providers.values()].filter((p) => !port || p.port === port || p.port === "*");

export const getProvider = (key) => _providers.get(key) || null;

/**
 * Corre al cargar el módulo. Devuelve los contratos incompletos: la UI los
 * muestra y esos proveedores **no se ofrecen para conectar**.
 */
export const assertProviderContracts = () =>
  [..._providers.values()].flatMap(validateProvider);

/**
 * Cuántos proveedores hay. Se cuentan **por separado** los dobles de prueba: la
 * pantalla tiene que poder decir "0 integraciones reales" aunque el marco tenga
 * con qué probarse.
 */
export const providerCount = () => {
  const all = [..._providers.values()];
  return {
    total: all.length,
    real: all.filter((p) => !p.demo).length,
    demo: all.filter((p) => p.demo).length,
  };
};
