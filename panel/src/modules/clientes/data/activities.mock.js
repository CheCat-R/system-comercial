/**
 * Semilla de actividad *manual* (notas, llamadas, reuniones, tareas).
 * Los eventos automáticos (pedidos, pagos, cambios de segmento) los genera
 * `clientsApi` a partir de los pedidos; no se guardan acá.
 *
 * type: "note" | "call" | "meeting" | "email" | "task" | "campaign"
 */
import { TODAY, toDayString } from "../lib/time";

const at = (daysAgo, hh = 10, mm = 0) => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - daysAgo);
  return `${toDayString(d)}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
};

const agent = { kind: "user", id: "u-maria", name: "María López" };
const cx = { kind: "user", id: "u-carlos", name: "Carlos Pérez" };

export const activities = [
  {
    id: "ACT-seed-1",
    accountId: "CLI-001",
    type: "call",
    title: "Llamada de seguimiento",
    description: "Confirmó interés en la línea premium para el pedido de esta semana. Pidió factura A.",
    actor: agent,
    at: at(3, 15, 20),
  },
  {
    id: "ACT-seed-2",
    accountId: "CLI-001",
    type: "note",
    title: "Cliente mayorista",
    description: "Aplica lista de precios mayorista. Retira en depósito los martes.",
    actor: agent,
    at: at(40, 9, 5),
  },
  {
    id: "ACT-seed-3",
    accountId: "CLI-005",
    type: "meeting",
    title: "Reunión trimestral de cuenta",
    description: "Revisión de volúmenes Q3. Proyectan +20% para fin de año. Diego (Finanzas) pidió extender plazo de pago a 45 días.",
    actor: agent,
    at: at(12, 11, 0),
  },
  {
    id: "ACT-seed-4",
    accountId: "CLI-005",
    type: "task",
    title: "Enviar propuesta de plazo 45 días",
    description: "Coordinar con Finanzas interna antes del viernes.",
    actor: agent,
    at: at(11, 17, 30),
  },
  {
    id: "ACT-seed-5",
    accountId: "CLI-007",
    type: "note",
    title: "Bajó el ritmo de compra",
    description: "No compra hace más de 2 meses. Antes pedía cada 3 semanas. Contactar.",
    actor: cx,
    at: at(20, 10, 15),
  },
  {
    id: "ACT-seed-6",
    accountId: "CLI-004",
    type: "email",
    title: "Email manual de reactivación",
    description: "Se le envió un cupón del 15% por email. Sin respuesta aún.",
    actor: cx,
    at: at(18, 12, 0),
  },
  {
    id: "ACT-seed-7",
    accountId: "CLI-003",
    type: "note",
    title: "Primera compra",
    description: "Llegó desde la tienda online. Buscar upsell de accesorios.",
    actor: agent,
    at: at(22, 16, 45),
  },
];
