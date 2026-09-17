import { atDaysAgo } from "../lib/time";

/**
 * Audiencias = base del CRM (segmento / etiqueta / todos) + filtros de comportamiento de marketing +
 * exclusiones. Se resuelven contra `clientsApi` en `resolveAudience`. Ver docs/MODULO-MARKETING.md §2.
 */
export const audiences = [
  {
    id: "AUD-01",
    name: "Mayoristas activos",
    base: { type: "tag", value: "mayorista", label: "mayorista" },
    filters: [{ field: "subscribed_email", value: null }],
    exclusions: { unsubscribed: true },
    createdAt: atDaysAgo(40),
  },
  {
    id: "AUD-02",
    name: "Reactivación · en riesgo y durmientes",
    base: { type: "all" },
    filters: [
      { field: "days_since_last_order_gt", value: 45 },
      { field: "never_opened", value: null },
    ],
    exclusions: { unsubscribed: true },
    createdAt: atDaysAgo(22),
  },
  {
    id: "AUD-03",
    name: "Clientes nuevos (onboarding)",
    base: { type: "tag", value: "nuevo", label: "nuevo" },
    filters: [],
    exclusions: {},
    createdAt: atDaysAgo(15),
  },
  {
    id: "AUD-04",
    name: "Toda la cartera suscripta a email",
    base: { type: "all" },
    filters: [{ field: "subscribed_email", value: null }],
    exclusions: { unsubscribed: true },
    createdAt: atDaysAgo(8),
  },
];
