/**
 * Secciones guardadas — plantillas reutilizables.
 *
 * Una sección que ya quedó bien ("nuestra barra de beneficios", "el bloque de
 * garantía") se congela acá y se inserta en otras páginas **como copia**: cada
 * página queda dueña de la suya, sin acoplamientos sorpresa. La propagación
 * (`linked: true`) queda para más adelante.
 */
import { atDaysAgo } from "../lib/time";

export const savedSections = [
  {
    id: "SS-1",
    name: "Barra de beneficios",
    description: "Envío, cuotas, cambios y compra protegida. La que usa la home.",
    createdAt: atDaysAgo(30),
    section: {
      name: "Beneficios",
      layout: { width: "wide", background: "sunken", spacing: "sm", columns: 1, columnRatio: "equal", mobileStack: true },
      visibility: { mode: "always" },
      blocks: [
        {
          type: "usp-bar",
          visibility: { mode: "always" },
          column: 0,
          props: {
            layout: "inline",
            items: [
              { _id: "SS1-1", icon: "truck", title: "Envío gratis", subtitle: "En compras desde $80.000" },
              { _id: "SS1-2", icon: "card", title: "Hasta 12 cuotas", subtitle: "Con todas las tarjetas" },
              { _id: "SS1-3", icon: "refresh", title: "Cambios en 30 días", subtitle: "Sin costo, en todo el país" },
              { _id: "SS1-4", icon: "shield", title: "Compra protegida", subtitle: "Devolución garantizada" },
            ],
          },
        },
      ],
    },
  },
  {
    id: "SS-2",
    name: "Preguntas frecuentes de envío",
    description: "Las cuatro preguntas que más entran por WhatsApp.",
    createdAt: atDaysAgo(18),
    section: {
      name: "Preguntas frecuentes",
      layout: { width: "narrow", background: "surface", spacing: "lg", columns: 1, columnRatio: "equal", mobileStack: true },
      visibility: { mode: "always" },
      blocks: [
        {
          type: "faq",
          visibility: { mode: "always" },
          column: 0,
          props: {
            heading: "Preguntas frecuentes",
            defaultOpenIndex: 0,
            items: [
              { _id: "SS2-1", q: "¿Cuánto tarda el envío?", a: "Despachamos dentro de las 48 h hábiles. La entrega demora de 3 a 7 días según la localidad." },
              { _id: "SS2-2", q: "¿El envío es gratis?", a: "Sí, en compras desde $80.000 a todo el país. Por debajo de ese monto el costo se calcula al finalizar la compra." },
              { _id: "SS2-3", q: "¿Puedo cambiar el talle?", a: "Tenés 30 días para cambiar cualquier producto sin uso. El primer cambio no tiene costo." },
              { _id: "SS2-4", q: "¿Hacen factura A?", a: "Sí. Cargá tu CUIT al finalizar la compra y se emite automáticamente." },
            ],
          },
        },
      ],
    },
  },
  {
    id: "SS-3",
    name: "Cierre con newsletter",
    description: "Captura de email para el pie de las landings.",
    createdAt: atDaysAgo(9),
    section: {
      name: "Newsletter",
      layout: { width: "wide", background: "accent-subtle", spacing: "lg", columns: 1, columnRatio: "equal", mobileStack: true },
      visibility: { mode: "always" },
      blocks: [
        {
          type: "newsletter",
          visibility: { mode: "always" },
          column: 0,
          props: {
            heading: "Enterate antes que el resto",
            body: "Lanzamientos, reposiciones y ofertas reales. Un mail por semana, sin vueltas.",
            buttonLabel: "Suscribirme",
            channel: "email",
            tagOnSubscribe: "newsletter",
          },
        },
      ],
    },
  },
];
