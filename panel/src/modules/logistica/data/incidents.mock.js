import { atDaysAgo } from "../lib/time";

export const incidents = [
  {
    id: "INC-001",
    shipmentId: "SHP-003",
    type: "rechazado",
    description: "El destinatario rechazó el paquete al momento de la entrega.",
    status: "resuelta",
    resolution: "devolver",
    note: "Devolución procesada, stock repuesto y reembolso aprobado por Finanzas.",
    openedAt: atDaysAgo(0, "09", "05"),
    resolvedAt: atDaysAgo(0, "09", "40"),
  },
  {
    id: "INC-002",
    shipmentId: "SHP-002",
    type: "demora_transportista",
    description: "El transportista reporta demora por corte de ruta — reprograma la entrega.",
    status: "abierta",
    resolution: null,
    note: "",
    openedAt: atDaysAgo(0, "09", "30"),
    resolvedAt: null,
  },
];
