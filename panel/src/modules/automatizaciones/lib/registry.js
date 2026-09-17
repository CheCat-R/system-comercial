/**
 * ⭐ El registro del motor. La pieza que hace que Automatizaciones no conozca el dominio.
 *
 * @sin-dependencias  Verificado por scripts/verificar-arquitectura.mjs:
 *                    este archivo NO puede tener ni un `import`.
 *
 * ── El problema que resuelve ──────────────────────────────────────────────
 *
 * Automatizaciones es transversal por definición: para que una regla diga
 * «cuando un pedido queda impago 3 días, avisale al vendedor», el motor tiene
 * que saber qué es un pedido, cómo se lo carga y qué se le puede hacer.
 *
 * Hasta acá eso estaba escrito como **imports directos**: `subjects.js`,
 * `scanner.js`, `actions.js` y `conditions.js` importaban de ocho módulos de
 * negocio. El efecto medido: el grafo **entre módulos** tenía un nudo de diez, y
 * llevarse un solo módulo a un proyecto nuevo arrastraba los otros nueve.
 *
 * (El chequeo de arquitectura no lo veía porque verificaba ciclos entre
 * **archivos** y no hay ninguno: `bus.js` es hoja. El ciclo estaba un nivel más
 * arriba, entre **módulos**. Ahora `check:arch` mira los dos niveles.)
 *
 * ── La inversión ──────────────────────────────────────────────────────────
 *
 *   antes   automatizaciones ──importa──▶ pedidos, clientes, inventario, …
 *   ahora   pedidos, clientes, inventario, … ──se registran──▶ automatizaciones
 *
 * Es el mismo patrón que ya usan `integraciones/lib/ports.js` (`setPipeline`) y
 * `seguridad/lib/gate.js` (`setStepUpCheck`): **la hoja declara el enchufe y el
 * módulo dueño lo llena**. Acá la hoja es este archivo.
 *
 * Consecuencia práctica, que es el punto de todo esto: **borrar un módulo de
 * negocio no rompe el motor**. Se van con él sus sujetos, sus escáneres, sus
 * acciones y sus condiciones, y el motor sigue andando con lo que quede. Una
 * regla vieja que apunte a algo que ya no está queda explicada, no rota
 * (`faltante()`).
 *
 * Quién llena el registro: `src/app/registrarDominio.js`, que es la única lista
 * de módulos activos del proyecto. Borrar una línea de ahí es borrar un módulo.
 */

/* ------------------------------------------------------------- sujetos */

const _sujetos = new Map();

/**
 * Un tipo de sujeto: qué entidad es, cómo se la carga y cómo se la nombra.
 *
 * @param {string} tipo        "order", "account", "sku"… — la llave que usan las reglas
 * @param {object} def
 * @param {function} def.cargar     (id, helpers) → objeto de entidades, o null si ya no existe
 * @param {function} [def.derivar]  (cargado, helpers) → campos calculados (antigüedad, horas…)
 * @param {function} [def.describir] (subject, ctx) → etiqueta legible para la lista y el historial
 * @param {string}   [def.label]    nombre del tipo para la UI
 */
export const registrarSujeto = (tipo, def) => {
  if (!tipo || typeof def?.cargar !== "function") return;
  _sujetos.set(tipo, { tipo, ...def });
};

export const sujeto = (tipo) => _sujetos.get(tipo) || null;
export const tiposDeSujeto = () => [..._sujetos.keys()];

/* --------------------------------------------- sujetos que otro enriquece */

const _extensiones = new Map();

/**
 * ⭐ Un módulo le agrega entidades al sujeto de otro, sin que ninguno importe al otro.
 *
 * El caso que lo obligó: el contexto de un pedido incluye **su cuenta**, para
 * que se puedan escribir reglas como «si el cliente es VIP y el pedido supera
 * X». Antes eso lo resolvía el motor importando Pedidos *y* CRM.
 *
 * Pero «el pedido tiene una cuenta» es una idea del CRM, no de Pedidos: es el
 * CRM el que sabe que la cuenta se busca por `customerName`. Así que el CRM
 * extiende el sujeto ajeno:
 *
 *     extenderSujeto("order", ({ order }) => ({ account: buscarPorNombre(order) }));
 *
 * Y el efecto correcto sale gratis: **un panel sin CRM no tiene `ctx.account`,
 * y tampoco tiene las condiciones `account.*`.** Las dos cosas desaparecen
 * juntas porque las declara el mismo archivo.
 *
 * @param {string}   tipo      el sujeto ajeno a enriquecer
 * @param {function} extender  (cargado, helpers) → entidades extra
 */
export const extenderSujeto = (tipo, extender) => {
  if (!tipo || typeof extender !== "function") return;
  const lista = _extensiones.get(tipo) || [];
  lista.push(extender);
  _extensiones.set(tipo, lista);
};

export const extensionesDe = (tipo) => _extensiones.get(tipo) || [];

/* ----------------------------------------------------------- escáneres */

const _escaneres = new Map();

/**
 * El escáner de una condición observada (§2.3): dado un evento de tipo `state`,
 * devuelve los sujetos que **ahora mismo** la cumplen.
 *
 * @param {string}   evento     "stock.bajo_minimo", "carrito.abandonado"…
 * @param {function} escanear   (params, helpers) → [{ subject, payload, key? }]
 */
export const registrarEscaner = (evento, escanear) => {
  if (!evento || typeof escanear !== "function") return;
  _escaneres.set(evento, escanear);
};

export const escaner = (evento) => _escaneres.get(evento) || null;
export const eventosConEscaner = () => [..._escaneres.keys()];

/* ------------------------------------------------------------ acciones */

const _acciones = new Map();

/** Una acción del catálogo (§5.3). La definición es la misma de siempre; lo único que cambia es quién la declara. */
export const registrarAccion = (key, def) => {
  if (!key || !def) return;
  _acciones.set(key, { ...def, key });
};

export const registrarAcciones = (mapa) =>
  Object.entries(mapa || {}).forEach(([key, def]) => registrarAccion(key, def));

export const accion = (key) => _acciones.get(key) || null;
export const acciones = () => [..._acciones.values()];

/* --------------------------------------------------------- condiciones */

const _condiciones = new Map();

/** Una condición del catálogo (§4.1). `options` sigue siendo un thunk: se lee del módulo dueño al abrir el selector, no se copia. */
export const registrarCondicion = (key, def) => {
  if (!key || !def) return;
  _condiciones.set(key, { ...def, key });
};

export const registrarCondiciones = (mapa) =>
  Object.entries(mapa || {}).forEach(([key, def]) => registrarCondicion(key, def));

export const condicion = (key) => _condiciones.get(key) || null;
export const condiciones = () => [..._condiciones.values()];

/* ------------------------------------------------------- lo que faltó */

/**
 * Por qué una regla apunta a algo que el registro no tiene.
 *
 * En un panel armado a medida esto **no es un error**: significa que el proyecto
 * no incluye ese módulo. La regla no se ejecuta y se dice por qué, en vez de
 * fallar con "undefined is not a function" en el motor.
 */
export const faltante = (que, key) =>
  `«${key}» no está registrado: el módulo que declara ${que} no forma parte de este panel.`;

/* -------------------------------------------- el enchufe de Seguridad */

/**
 * ⭐ Seguridad tampoco se importa: se enchufa.
 *
 * El motor necesita tres cosas de Seguridad —correr con un actor, saber cuál es
 * el actor de una automatización, y preguntar si un rol puede algo— y si las
 * importara volvería a cerrar el círculo, porque `securityApi` emite al bus.
 *
 * Los valores por omisión **niegan**. Un panel sin módulo de seguridad tiene que
 * enchufar el suyo o decir explícitamente que no hay control; que el motor
 * ejecute todo porque nadie contestó sería la peor de las respuestas.
 */
let _seguridad = {
  conActor: (_actor, fn) => fn(),
  actorAutomatizacion: (rule) => ({ kind: "automation", id: rule?.id || "auto", name: rule?.name || "Automatización" }),
  puede: () => false,
  actorActual: () => null,
};

export const enchufarSeguridad = (impl) => {
  _seguridad = { ..._seguridad, ...impl };
};

export const seguridad = () => _seguridad;
