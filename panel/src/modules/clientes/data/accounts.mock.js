/**
 * Mock de Cuentas (Account) + Contactos + Direcciones embebidas.
 * En producción esto vendría de `GET /api/v1/accounts`. La UI nunca lee este
 * archivo directamente — siempre pasa por `api/clientsApi.js`.
 *
 * `taxCondition` (condición frente al IVA) lo consume Facturación para resolver la letra del
 * comprobante — ver docs/MODULO-FINANZAS-FACTURACION.md §3.2 / §7.3. Valores:
 * "Responsable Inscripto" | "Monotributo" | "Consumidor Final" | "Exento".
 */

export const accounts = [
  {
    id: "CLI-001",
    type: "person",
    name: "Juan Pérez",
    legalName: null,
    taxId: "20-31456789-4",
    taxCondition: "Responsable Inscripto",
    email: "juan.perez@ejemplo.com",
    phone: "+54 9 11 4123-5678",
    ownerUserId: "u-maria",
    tierOverride: null,
    tags: ["mayorista", "frecuente"],
    createdAt: "2024-01-12",
    contacts: [
      { id: "CT-001", name: "Juan Pérez", email: "juan.perez@ejemplo.com", phone: "+54 9 11 4123-5678", role: null, isPrimary: true },
    ],
    addresses: [
      { id: "AD-001", label: "Casa", line1: "Av. Corrientes 1234", line2: "Piso 5, Depto B", city: "CABA", state: "Buenos Aires", zip: "C1043AAZ", country: "Argentina", isDefaultShipping: true, isDefaultBilling: true },
      { id: "AD-002", label: "Trabajo", line1: "Av. Santa Fe 2500", line2: "Oficina 10", city: "CABA", state: "Buenos Aires", zip: "C1123AAV", country: "Argentina", isDefaultShipping: false, isDefaultBilling: false },
    ],
  },
  {
    id: "CLI-002",
    type: "person",
    name: "María López",
    legalName: null,
    taxId: "27-28998112-0",
    taxCondition: "Consumidor Final",
    email: "maria.lopez@ejemplo.com",
    phone: "+54 9 351 512-8890",
    ownerUserId: "u-carlos",
    tierOverride: null,
    tags: [],
    createdAt: "2024-02-03",
    contacts: [
      { id: "CT-002", name: "María López", email: "maria.lopez@ejemplo.com", phone: "+54 9 351 512-8890", role: null, isPrimary: true },
    ],
    addresses: [
      { id: "AD-003", label: "Casa", line1: "Bv. San Juan 455", line2: "", city: "Córdoba", state: "Córdoba", zip: "X5000", country: "Argentina", isDefaultShipping: true, isDefaultBilling: true },
    ],
  },
  {
    id: "CLI-003",
    type: "person",
    name: "Carlos Gómez",
    legalName: null,
    taxId: null,
    taxCondition: "Consumidor Final",
    email: "carlos.gomez@ejemplo.com",
    phone: "+54 9 261 233-1120",
    ownerUserId: "u-maria",
    tierOverride: null,
    tags: ["nuevo"],
    createdAt: "2026-07-28",
    contacts: [
      { id: "CT-003", name: "Carlos Gómez", email: "carlos.gomez@ejemplo.com", phone: "+54 9 261 233-1120", role: null, isPrimary: true },
    ],
    addresses: [
      { id: "AD-004", label: "Casa", line1: "Calle Las Heras 88", line2: "", city: "Mendoza", state: "Mendoza", zip: "M5500", country: "Argentina", isDefaultShipping: true, isDefaultBilling: true },
    ],
  },
  {
    id: "CLI-004",
    type: "person",
    name: "Ana Torres",
    legalName: null,
    taxId: "27-30112445-8",
    taxCondition: "Consumidor Final",
    email: "ana.torres@ejemplo.com",
    phone: "+54 9 11 6612-0044",
    ownerUserId: "u-carlos",
    tierOverride: null,
    tags: [],
    createdAt: "2024-03-19",
    contacts: [
      { id: "CT-004", name: "Ana Torres", email: "ana.torres@ejemplo.com", phone: "+54 9 11 6612-0044", role: null, isPrimary: true },
    ],
    addresses: [
      { id: "AD-005", label: "Casa", line1: "Rivadavia 4820", line2: "", city: "CABA", state: "Buenos Aires", zip: "C1424", country: "Argentina", isDefaultShipping: true, isDefaultBilling: true },
    ],
  },
  {
    id: "CLI-005",
    type: "company",
    name: "Empresa ABC S.A.",
    legalName: "ABC Comercial Sociedad Anónima",
    taxId: "30-71234567-9",
    taxCondition: "Responsable Inscripto",
    email: "compras@empresaabc.com",
    phone: "+54 11 4890-1000",
    ownerUserId: "u-maria",
    tierOverride: null,
    tags: ["b2b", "mayorista"],
    createdAt: "2024-01-05",
    contacts: [
      { id: "CT-005", name: "Lucía Fernández", email: "compras@empresaabc.com", phone: "+54 11 4890-1010", role: "Compras", isPrimary: true },
      { id: "CT-006", name: "Diego Ramírez", email: "finanzas@empresaabc.com", phone: "+54 11 4890-1020", role: "Finanzas", isPrimary: false },
    ],
    addresses: [
      { id: "AD-006", label: "Depósito central", line1: "Ruta 8 km 34,5", line2: "Parque Industrial", city: "Pilar", state: "Buenos Aires", zip: "B1629", country: "Argentina", isDefaultShipping: true, isDefaultBilling: false },
      { id: "AD-007", label: "Administración", line1: "Reconquista 660", line2: "Piso 12", city: "CABA", state: "Buenos Aires", zip: "C1003", country: "Argentina", isDefaultShipping: false, isDefaultBilling: true },
    ],
  },
  {
    id: "CLI-006",
    type: "person",
    name: "Sofía Ruiz",
    legalName: null,
    taxId: null,
    taxCondition: "Consumidor Final",
    email: "sofia.ruiz@ejemplo.com",
    phone: "+54 9 223 455-9087",
    ownerUserId: "u-carlos",
    tierOverride: null,
    tags: [],
    createdAt: "2026-08-22",
    contacts: [
      { id: "CT-007", name: "Sofía Ruiz", email: "sofia.ruiz@ejemplo.com", phone: "+54 9 223 455-9087", role: null, isPrimary: true },
    ],
    addresses: [],
  },
  {
    id: "CLI-007",
    type: "company",
    name: "Distribuidora Norte",
    legalName: "Distribuidora Norte S.R.L.",
    taxId: "30-70987654-3",
    taxCondition: "Responsable Inscripto",
    email: "pedidos@distnorte.com.ar",
    phone: "+54 387 421-7788",
    ownerUserId: "u-roberto",
    tierOverride: null,
    tags: ["b2b"],
    createdAt: "2024-05-30",
    contacts: [
      { id: "CT-008", name: "Marcelo Sosa", email: "pedidos@distnorte.com.ar", phone: "+54 387 421-7788", role: "Compras", isPrimary: true },
    ],
    addresses: [
      { id: "AD-008", label: "Depósito", line1: "Av. Tavella 2200", line2: "", city: "Salta", state: "Salta", zip: "A4400", country: "Argentina", isDefaultShipping: true, isDefaultBilling: true },
    ],
  },
  {
    id: "CLI-008",
    type: "person",
    name: "Roberto Díaz",
    legalName: null,
    taxId: "20-29887456-1",
    taxCondition: "Monotributo",
    email: "roberto.diaz@ejemplo.com",
    phone: "+54 9 341 700-2233",
    ownerUserId: "u-roberto",
    tierOverride: null,
    tags: [],
    createdAt: "2024-06-11",
    contacts: [
      { id: "CT-009", name: "Roberto Díaz", email: "roberto.diaz@ejemplo.com", phone: "+54 9 341 700-2233", role: null, isPrimary: true },
    ],
    addresses: [
      { id: "AD-009", label: "Casa", line1: "Córdoba 1450", line2: "", city: "Rosario", state: "Santa Fe", zip: "S2000", country: "Argentina", isDefaultShipping: true, isDefaultBilling: true },
    ],
  },
];

export const owners = {
  "u-maria": "María López",
  "u-carlos": "Carlos Pérez",
  "u-roberto": "Roberto Díaz",
};
