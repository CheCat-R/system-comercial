import { atDaysAgo } from "../lib/time";

/** Plantillas de mensaje reutilizables por canal. Variables disponibles: {{nombre}}, {{cupon}}, {{producto}}. */
export const templates = [
  {
    id: "TPL-01",
    name: "Newsletter mayoristas",
    channel: "email",
    category: "newsletter",
    subject: "Novedades y reposición para tu comercio",
    body: "Hola {{nombre}}, llegaron unidades nuevas de nuestros productos más pedidos. Reservá stock antes de que se agote.",
    previewProductIds: ["SKU-1", "SKU-5"],
    createdAt: atDaysAgo(30),
  },
  {
    id: "TPL-02",
    name: "Reactivación con cupón",
    channel: "email",
    category: "promocional",
    subject: "Te extrañamos — {{cupon}} para tu próxima compra",
    body: "Hola {{nombre}}, hace un tiempo que no nos visitás. Usá el código {{cupon}} y llevate un descuento en tu próxima compra.",
    previewProductIds: ["SKU-2", "SKU-4"],
    createdAt: atDaysAgo(22),
  },
  {
    id: "TPL-03",
    name: "Bienvenida onboarding",
    channel: "email",
    category: "transaccional",
    subject: "¡Bienvenido/a a CheCAT!",
    body: "Hola {{nombre}}, gracias por tu primera compra. Acá va {{cupon}} para la próxima y algunos productos que te pueden interesar.",
    previewProductIds: ["SKU-3"],
    createdAt: atDaysAgo(15),
  },
  {
    id: "TPL-04",
    name: "Push · oferta relámpago",
    channel: "push",
    category: "promocional",
    subject: null,
    body: "⚡ {{producto}} con descuento por tiempo limitado. Tocá para ver.",
    previewProductIds: ["SKU-1"],
    createdAt: atDaysAgo(10),
  },
];
