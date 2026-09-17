/**
 * Lo que el CRM le ofrece al motor de Automatizaciones.
 *
 * ⭐ Además de su propio sujeto, este archivo **enriquece los sujetos ajenos**:
 * un pedido, un envío y un carrito llevan su cuenta en el contexto para que se
 * puedan escribir reglas como «si el cliente es VIP y el pedido supera X».
 *
 * Eso vive acá y no en Pedidos porque es una idea del CRM: es el CRM el que sabe
 * que la cuenta se busca por `customerName`. Y así, un panel sin CRM no tiene
 * `ctx.account` **ni** las condiciones `account.*` — las dos cosas desaparecen
 * juntas, porque las declara el mismo archivo.
 */
import { getAccount, listAccounts, addActivity, saveTags, sendToCampaign } from "./api/clientsApi";
import { SEGMENTS, TIERS } from "./lib/segments";
import { registrarSujeto, extenderSujeto, registrarEscaner, registrarAcciones } from "../automatizaciones/lib/registry";
import { interpolate } from "../automatizaciones/lib/subjects";
import {
  registrarCondiciones, asOptions, NUMERIC_OPS, ENUM_OPS, LIST_OPS,
} from "../automatizaciones/lib/conditions";

/* -------------------------------------------------------------- sujeto */

registrarSujeto("account", {
  label: "Cliente",
  cargar: (id, { safe }) => {
    const account = safe(() => getAccount(id));
    return account ? { account } : null;
  },
  describir: (subject, c) => c.account?.name || subject.id,
});

/* ------------------------------------------ la cuenta de un sujeto ajeno */

// La misma llave que usa Analytics, porque `order.accountId` no existe en el
// mock de Pedidos.
const porNombre = (nombre, safe) =>
  nombre ? safe(() => listAccounts().find((a) => a.name === nombre), null) : null;

extenderSujeto("order", ({ order }, { safe }) => ({ account: porNombre(order?.customerName, safe) }));

extenderSujeto("shipment", ({ order }, { safe }) => ({ account: porNombre(order?.customerName, safe) }));

extenderSujeto("cart", ({ cart }, { safe }) => ({ account: safe(() => getAccount(cart?.accountId)) }));

/* ------------------------------------------------------------- escáner */

registrarEscaner("cliente.inactivo", ({ days = 90 } = {}, { safe }) =>
  safe(listAccounts)
    .filter((a) => a.metrics?.recencyDays != null && a.metrics.recencyDays >= Number(days))
    .map((a) => ({
      subject: { type: "account", id: a.id },
      payload: { accountId: a.id, name: a.name, recencyDays: a.metrics.recencyDays, segment: a.metrics.segmentKey },
    })));

/* ------------------------------------------------------------ acciones */

registrarAcciones({
  "account.note": {
    label: "Anotar en el timeline del cliente", group: "CRM", tier: "safe",
    subjectTypes: ["account", "order", "shipment", "cart"],
    calls: "clientsApi.addActivity",
    params: [
      { key: "title", label: "Título de la nota", type: "text", required: true, default: "Automatización" },
      { key: "description", label: "Detalle", type: "textarea", default: "" },
    ],
    preview: (ctx, p) => ctx.account
      ? `Anotar «${interpolate(p.title, ctx)}» en el timeline de ${ctx.account.name}`
      : "No hay cuenta asociada a este sujeto: la nota no se escribiría.",
    run: (ctx, p) => {
      if (!ctx.account) return { ok: false, detail: "El sujeto no tiene una cuenta asociada." };
      const act = addActivity(ctx.account.id, {
        type: "note",
        title: interpolate(p.title, ctx),
        description: interpolate(p.description, ctx),
      });
      return { ok: true, detail: `Nota agregada a ${ctx.account.name}`, ref: act.id };
    },
  },

  "account.tag": {
    label: "Etiquetar al cliente", group: "CRM", tier: "safe",
    subjectTypes: ["account", "order", "shipment", "cart"],
    calls: "clientsApi.saveTags",
    params: [
      { key: "tag", label: "Etiqueta", type: "text", required: true, default: "seguimiento" },
    ],
    preview: (ctx, p) => ctx.account
      ? `Etiquetar a ${ctx.account.name} con «${p.tag}»`
      : "No hay cuenta asociada a este sujeto.",
    run: (ctx, p) => {
      if (!ctx.account) return { ok: false, detail: "El sujeto no tiene una cuenta asociada." };
      const current = getAccount(ctx.account.id)?.tags || [];
      const tag = String(p.tag || "").trim().toLowerCase();
      if (!tag) return { ok: false, detail: "La etiqueta está vacía." };
      if (current.includes(tag)) return { ok: true, detail: `${ctx.account.name} ya tenía la etiqueta «${tag}»` };
      // `saveTags` reemplaza la lista entera: hay que mandar la unión, no sólo la nueva.
      saveTags(ctx.account.id, [...current, tag]);
      return { ok: true, detail: `Etiqueta «${tag}» agregada a ${ctx.account.name}` };
    },
  },

  "account.campaign": {
    label: "Enviar el cliente a una audiencia", group: "Marketing", tier: "contact",
    subjectTypes: ["account", "order", "shipment", "cart"],
    calls: "clientsApi.sendToCampaign",
    params: [
      { key: "audienceName", label: "Nombre de la audiencia", type: "text", required: true, default: "Automatización" },
    ],
    preview: (ctx, p) => ctx.account
      ? `Sumar a ${ctx.account.name} a la audiencia «${p.audienceName}»`
      : "No hay cuenta asociada a este sujeto.",
    run: (ctx, p) => {
      if (!ctx.account) return { ok: false, detail: "El sujeto no tiene una cuenta asociada." };
      const r = sendToCampaign({ audienceName: p.audienceName, accountIds: [ctx.account.id] });
      return { ok: true, detail: `${ctx.account.name} → audiencia «${r.audienceName}»` };
    },
  },
});

/* --------------------------------------------------------- condiciones */

registrarCondiciones({
  "account.segment": {
    label: "Segmento del cliente", group: "Cliente",
    subjectTypes: ["account", "order", "shipment", "cart"], type: "enum", ops: [...ENUM_OPS, "changed_to"],
    source: "clientsApi — clientes/lib/segments.js (RFM)",
    options: () => asOptions(SEGMENTS),
    get: (c) => c.account?.metrics?.segmentKey ?? null,
  },
  "account.tier": {
    label: "Tier del cliente", group: "Cliente",
    subjectTypes: ["account", "order", "shipment", "cart"], type: "enum", ops: [...ENUM_OPS, "changed_to"],
    source: "clientsApi — el CRM es dueño de la definición de VIP",
    options: () => asOptions(TIERS),
    hint: "«VIP» es el tier que el CRM deriva del segmento «Campeón».",
    get: (c) => c.account?.metrics?.tier ?? c.account?.tier ?? null,
  },
  "account.type": {
    label: "Tipo de cuenta", group: "Cliente",
    subjectTypes: ["account", "order", "shipment", "cart"], type: "enum", ops: ENUM_OPS,
    source: "clientsApi.getAccount().type",
    options: () => [{ value: "person", label: "Persona" }, { value: "company", label: "Empresa" }],
    get: (c) => c.account?.type ?? null,
  },
  "account.ltv": {
    label: "LTV del cliente", group: "Cliente",
    subjectTypes: ["account", "order", "shipment", "cart"], type: "money", ops: NUMERIC_OPS,
    source: "clientsApi — metrics.ltv (el CRM es la autoridad)",
    get: (c) => c.account?.metrics?.ltv ?? null,
  },
  "account.ordersCount": {
    label: "Pedidos del cliente", group: "Cliente",
    subjectTypes: ["account", "order", "shipment", "cart"], type: "number", ops: NUMERIC_OPS,
    source: "clientsApi — metrics.ordersCount",
    get: (c) => c.account?.metrics?.ordersCount ?? null,
  },
  "account.recencyDays": {
    label: "Días desde la última compra", group: "Cliente",
    subjectTypes: ["account", "order", "shipment", "cart"], type: "number", ops: NUMERIC_OPS,
    source: "clientsApi — metrics.recencyDays",
    get: (c) => c.account?.metrics?.recencyDays ?? null,
  },
  "account.tags": {
    label: "Etiquetas del cliente", group: "Cliente",
    subjectTypes: ["account", "order", "shipment", "cart"], type: "list", ops: LIST_OPS,
    source: "clientsApi.getAccount().tags",
    get: (c) => c.account?.tags ?? [],
  },
});
