import { atDaysAgo } from "../lib/time";

/**
 * Consentimiento por cuenta y canal. Marketing **no envía** a un canal en `baja` (regla dura §6.5).
 * Lo que no está listado se asume `suscripto` a email/push.
 */
export const subscriptions = [
  { accountId: "CLI-002", channel: "email", status: "baja", unsubscribedAt: atDaysAgo(35), source: "link en email" },
  { accountId: "CLI-008", channel: "email", status: "baja", unsubscribedAt: atDaysAgo(50), source: "link en email" },
  { accountId: "CLI-006", channel: "email", status: "no_confirmado", unsubscribedAt: null, source: "alta reciente" },
  { accountId: "CLI-003", channel: "sms", status: "baja", unsubscribedAt: atDaysAgo(12), source: "respuesta BAJA" },
];
