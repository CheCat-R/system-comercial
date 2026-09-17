export const branches = [
  { id: "SUC-01", name: "Local Palermo", address: "Av. Santa Fe 3450, CABA", isActive: true },
  { id: "SUC-02", name: "Local Belgrano", address: "Av. Cabildo 2100, CABA", isActive: true },
  { id: "SUC-03", name: "Centro de Distribución", address: "Parque Industrial, Pilar, Bs. As.", isActive: true },
];

export const warehouses = [
  { id: "DEP-01", branchId: "SUC-01", name: "Depósito Palermo", type: "venta", isActive: true },
  { id: "DEP-02", branchId: "SUC-01", name: "Trastienda Palermo", type: "reserva", isActive: true },
  { id: "DEP-03", branchId: "SUC-02", name: "Depósito Belgrano", type: "venta", isActive: true },
  { id: "DEP-04", branchId: "SUC-03", name: "Depósito Central", type: "reserva", isActive: true },
];
