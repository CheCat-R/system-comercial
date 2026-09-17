/**
 * ⭐ De dónde saca resultados la búsqueda global.
 *
 * El panel tenía un ⌘K prominente —con su botón en la navbar y el atajo escrito
 * al lado— cuyo campo de texto **no estaba conectado a nada**: escribir no hacía
 * nada, y debajo había tres enlaces fijos, uno de ellos rotulado
 * *"(Próximamente)"*. Era la señal más clara de que el producto aparentaba más de
 * lo que hacía, porque ⌘K es la interacción firma de un SaaS.
 *
 * No hizo falta construir nada nuevo: los 83 destinos ya estaban declarados en
 * `app/navigation.jsx` y las entidades ya se leen por los `api/` de cada módulo.
 * Esto sólo los junta.
 *
 * ── ⭐ Por qué cada fuente se pregunta por separado ─────────────────────
 *
 * Un índice global armado de antemano se desactualiza en cuanto alguien crea un
 * pedido. Acá cada fuente se consulta **en el momento de escribir**, contra el
 * `api/` de su módulo dueño — la misma decisión que toma el motor de
 * Automatizaciones al cargar el sujeto recién cuando evalúa.
 *
 * Y una fuente que falla no rompe la búsqueda: devuelve nada y las demás siguen.
 */
import { NAV_DESTINATIONS } from "../../app/navigation";
import { listOrders } from "../../modules/pedidos/api/pedidosApi";
import { listAccounts } from "../../modules/clientes/api/clientsApi";
import { listProducts } from "../../modules/productos/api/catalogApi";

/** Sin acentos y en minúscula: buscar "campanas" tiene que encontrar "Campañas". */
export const normalize = (s) =>
  String(s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

const safe = (fn, fallback = []) => { try { return fn(); } catch { return fallback; } };

/**
 * Puntaje: prefijo exacto pesa más que "contiene". Sin esto, escribir "pe"
 * pone «Reposición» arriba de «Pedidos», que es exactamente lo que uno buscaba.
 */
const score = (haystack, needle) => {
  const h = normalize(haystack);
  if (h === needle) return 100;
  if (h.startsWith(needle)) return 80;
  const words = h.split(/[\s·/-]+/);
  if (words.some((w) => w.startsWith(needle))) return 60;
  if (h.includes(needle)) return 30;
  return 0;
};

const best = (fields, needle) => Math.max(...fields.map((f) => score(f, needle)), 0);

/* ------------------------------------------------------------- fuentes */

const destinos = (q) =>
  NAV_DESTINATIONS
    .map((d) => ({
      kind: "destino",
      id: d.path,
      title: d.label,
      subtitle: [d.parent, d.section?.toLowerCase()].filter(Boolean).join(" · "),
      to: d.path,
      icon: d.icon,
      score: best([d.label, d.parent, d.path], q),
    }))
    .filter((r) => r.score > 0);

const pedidos = (q) =>
  safe(() => listOrders())
    .map((o) => ({
      kind: "pedido",
      id: o.id,
      title: `#${o.id}`,
      subtitle: `${o.customerName} · ${o.paymentStatus} · $${Math.round(o.total).toLocaleString("es-AR")}`,
      to: `/pedidos/${o.id}`,
      score: best([String(o.id), `#${o.id}`, o.customerName], q),
    }))
    .filter((r) => r.score > 0);

const clientes = (q) =>
  safe(() => listAccounts())
    .map((a) => ({
      kind: "cliente",
      id: a.id,
      title: a.name,
      subtitle: [a.email, a.type === "company" ? "empresa" : "persona"].filter(Boolean).join(" · "),
      to: `/clientes/${a.id}`,
      score: best([a.name, a.email, a.id, a.legalName], q),
    }))
    .filter((r) => r.score > 0);

const productos = (q) =>
  safe(() => listProducts())
    .map((p) => ({
      kind: "producto",
      id: p.id,
      title: p.name,
      subtitle: `${p.sku} · ${p.categoryName} · $${Math.round(p.price).toLocaleString("es-AR")}`,
      to: `/productos/${p.id}`,
      score: best([p.name, p.sku, p.categoryName, p.brandName], q),
    }))
    .filter((r) => r.score > 0);

export const GROUPS = [
  { kind: "destino", label: "Ir a" },
  { kind: "pedido", label: "Pedidos" },
  { kind: "cliente", label: "Clientes" },
  { kind: "producto", label: "Productos" },
];

/**
 * Busca en todas las fuentes y devuelve los grupos con resultados.
 *
 * `limitPerGroup` existe porque el valor de ⌘K está en elegir rápido, no en ver
 * todo: veinte pedidos que empiezan con "10" no ayudan más que cinco.
 */
export const search = (raw, { limitPerGroup = 5 } = {}) => {
  const q = normalize(raw).trim();
  if (q.length < 1) return [];

  const all = [...destinos(q), ...pedidos(q), ...clientes(q), ...productos(q)]
    .sort((a, b) => b.score - a.score);

  return GROUPS
    .map((g) => ({ ...g, items: all.filter((r) => r.kind === g.kind).slice(0, limitPerGroup) }))
    .filter((g) => g.items.length > 0);
};

/** Lo que se ofrece con el campo vacío: adonde se va normalmente. */
export const SUGGESTED_PATHS = ["/", "/pedidos", "/productos", "/clientes", "/analytics", "/seguridad/aprobaciones"];

export const suggestions = () =>
  SUGGESTED_PATHS
    .map((path) => NAV_DESTINATIONS.find((d) => d.path === path))
    .filter(Boolean)
    .map((d) => ({
      kind: "destino",
      id: d.path,
      title: d.label,
      subtitle: [d.parent, d.section?.toLowerCase()].filter(Boolean).join(" · "),
      to: d.path,
      icon: d.icon,
    }));
