/**
 * Historia de ventas generada — la tabla de hechos propia de Analytics.
 *
 * **Por qué existe.** Los datos vivos del panel son 8 pedidos de 8 cuentas en 24
 * días. Con eso una matriz de cohortes tiene una sola cohorte, la retención no
 * tiene un segundo mes y ningún promedio es estable. Ver docs/MODULO-ANALYTICS.md §1.3.
 *
 * **La regla que la hace segura.** Cubre **únicamente meses cerrados anteriores**
 * al arranque de los datos vivos: septiembre 2025 → julio 2026. Del 10 de agosto
 * de 2026 en adelante manda lo que devuelven los módulos. Como **no hay
 * solapamiento**, ningún mes lo calculan dos fuentes distintas y Analytics no
 * puede contradecir a Finanzas.
 *
 * Es **determinística**: mismo seed, mismos pedidos. No usa `Math.random()`, así
 * que dos personas mirando el panel ven exactamente los mismos números.
 */
import { products } from "../../productos/data/catalog.mock";

/* ------------------------------------------------------------------ azar */

/** PRNG determinístico (mulberry32). Un seed fijo = una historia fija. */
const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const between = (r, a, b) => a + Math.floor(r() * (b - a + 1));

/* ------------------------------------------------------- clientes ficticios */

const NOMBRES = [
  "Lucía", "Mateo", "Valentina", "Santiago", "Emilia", "Benjamín", "Camila", "Thiago",
  "Martina", "Joaquín", "Isabella", "Bautista", "Catalina", "Lautaro", "Julieta", "Tomás",
  "Renata", "Facundo", "Delfina", "Ignacio", "Pilar", "Ramiro", "Guadalupe", "Nicolás",
];
const APELLIDOS = [
  "Fernández", "Rodríguez", "González", "Sosa", "Romero", "Álvarez", "Molina", "Castro",
  "Ortiz", "Silva", "Benítez", "Acosta", "Medina", "Herrera", "Aguirre", "Vega",
  "Ponce", "Cabrera", "Ledesma", "Quiroga", "Bravo", "Correa", "Ibáñez", "Peralta",
];
const EMPRESAS = [
  "Deportes del Sur", "Running Store Norte", "Club Atlético Ribera", "Mayorista Andes",
  "Outdoor Patagonia", "Tienda Pampa", "Distribuidora Cuyo", "Gimnasios Unidos",
];

const ZONAS = ["CABA", "GBA", "Interior"];
const DEPOSITOS = ["DEP-01", "DEP-03", "DEP-04"];
const MEDIOS_PAGO = [
  "MercadoPago (Visa •••• 3391)",
  "MercadoPago (Visa •••• 8074)",
  "MercadoPago",
  "Transferencia bancaria",
];

/* ------------------------------------------------------------- calendario */

/** Meses cerrados que cubre la historia: 2025-09 … 2026-07 (11 meses). */
const MESES = (() => {
  const out = [];
  for (let i = 0; i < 11; i += 1) {
    const d = new Date(2025, 8 + i, 1);
    out.push({ year: d.getFullYear(), month: d.getMonth(), index: i });
  }
  return out;
})();

/**
 * Estacionalidad del rubro en Argentina, como multiplicador de volumen:
 * arranque de primavera, pico de fin de año, verano flojo, repunte de otoño.
 */
const ESTACIONALIDAD = {
  0: 0.72,  // enero
  1: 0.80,  // febrero
  2: 1.05,  // marzo — vuelta a la rutina
  3: 1.10,  // abril
  4: 1.15,  // mayo — frío, abrigo
  5: 1.00,  // junio
  6: 0.92,  // julio — vacaciones de invierno
  7: 0.98,  // agosto
  8: 1.08,  // septiembre — primavera
  9: 1.12,  // octubre
  10: 1.35, // noviembre — Black Friday / Cyber
  11: 1.45, // diciembre — fiestas
};

/** Clientes nuevos por mes: negocio que crece de a poco. */
const ADQUISICION = [10, 11, 12, 11, 9, 8, 11, 13, 14, 15, 16];

/**
 * Probabilidad de que un cliente ya adquirido vuelva a comprar en un mes dado.
 * Decae con la antigüedad de la cohorte — es lo que produce una curva de
 * retención con forma, en vez de una recta.
 */
const probRecompra = (mesesDesdeAlta) => 0.34 * Math.exp(-0.16 * mesesDesdeAlta) + 0.04;

/* ------------------------------------------------------------- generación */

const CUPONES = ["BIENVENIDA10", "HOTSALE20", "ENVIOGRATIS", "VUELVE15"];

const build = () => {
  const r = rng(20260903);
  const clientes = [];
  const pedidos = [];
  let seqCliente = 0;
  let seqPedido = 0;

  MESES.forEach(({ year, month, index }) => {
    // --- altas del mes ---
    const nuevos = [];
    for (let i = 0; i < ADQUISICION[index]; i += 1) {
      seqCliente += 1;
      const esEmpresa = r() < 0.12;
      const cliente = {
        id: `H-CLI-${String(seqCliente).padStart(3, "0")}`,
        name: esEmpresa
          ? `${pick(r, EMPRESAS)} ${seqCliente}`
          : `${pick(r, NOMBRES)} ${pick(r, APELLIDOS)}`,
        type: esEmpresa ? "company" : "person",
        zone: esEmpresa ? pick(r, ["GBA", "Interior"]) : pick(r, ZONAS),
        cohort: `${year}-${String(month + 1).padStart(2, "0")}`,
        cohortIndex: index,
      };
      clientes.push(cliente);
      nuevos.push(cliente);
    }

    // --- quiénes compran este mes ---
    const compradores = [...nuevos];
    clientes.forEach((c) => {
      if (c.cohortIndex >= index) return; // los nuevos ya están
      if (r() < probRecompra(index - c.cohortIndex)) compradores.push(c);
    });

    const factor = ESTACIONALIDAD[month];

    compradores.forEach((cliente) => {
      // En meses fuertes un mismo cliente puede comprar dos veces.
      const veces = r() < (factor - 1) * 0.5 ? 2 : 1;

      for (let v = 0; v < veces; v += 1) {
        seqPedido += 1;
        const dia = between(r, 1, new Date(year, month + 1, 0).getDate());
        const hora = between(r, 9, 21);

        // Un mayorista lleva más unidades y más caro.
        const esEmpresa = cliente.type === "company";
        const cantidadLineas = esEmpresa ? between(r, 2, 4) : between(r, 1, 3);

        const usados = new Set();
        const lines = [];
        for (let l = 0; l < cantidadLineas; l += 1) {
          const p = pick(r, products);
          if (usados.has(p.id)) continue;
          usados.add(p.id);
          lines.push({
            skuId: p.sku,
            productId: p.id,
            qty: esEmpresa ? between(r, 2, 6) : between(r, 1, 2),
            unitPrice: p.price,
            unitCost: p.cost,
          });
        }
        if (!lines.length) continue;

        const subtotal = lines.reduce((s, it) => s + it.qty * it.unitPrice, 0);

        // Descuentos: más frecuentes en los meses de promoción.
        const conCupon = r() < (month === 10 ? 0.42 : 0.16);
        const couponCode = conCupon ? pick(r, CUPONES) : null;
        const discount = conCupon ? Math.round(subtotal * (0.1 + r() * 0.12)) : 0;

        // Envío gratis por monto, igual que la promo real de Marketing.
        const shipping = subtotal - discount >= 80000 ? 0 : 3500;

        pedidos.push({
          id: `H-${100000 + seqPedido}`,
          date: `${year}-${String(month + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}T${String(hora).padStart(2, "0")}:${String(between(r, 0, 59)).padStart(2, "0")}:00`,
          accountId: cliente.id,
          customerName: cliente.name,
          accountType: cliente.type,
          // Mismo criterio que `channelOf` de Finanzas: el canal se deriva del
          // tipo de cuenta. Es un proxy, no un canal de adquisición (§3).
          channel: esEmpresa ? "Mayorista B2B" : "Tienda web",
          zone: cliente.zone,
          warehouseId: pick(r, DEPOSITOS),
          paymentMethod: esEmpresa ? "Transferencia bancaria" : pick(r, MEDIOS_PAGO),
          couponCode,
          discount,
          shipping,
          // Tasa de devolución realista para indumentaria y calzado.
          returned: r() < 0.045,
          lines,
        });
      }
    });
  });

  return { clientes, pedidos: pedidos.sort((a, b) => a.date.localeCompare(b.date)) };
};

const generated = build();

/** Clientes ficticios de la historia. No existen en el CRM (ids `H-CLI-*`). */
export const historyAccounts = generated.clientes;

/** Pedidos históricos, en el mismo formato que consume `lib/facts.js`. */
export const historyOrders = generated.pedidos;

/**
 * Gasto de marketing por mes, para el CAC de los meses históricos. En los meses
 * vivos el numerador sale de Finanzas (`listExpenses` categoría `marketing`).
 */
export const historyMarketingSpend = MESES.reduce((acc, { year, month, index }) => {
  const base = 180000 + index * 9000;
  acc[`${year}-${String(month + 1).padStart(2, "0")}`] = Math.round(base * ESTACIONALIDAD[month]);
  return acc;
}, {});
