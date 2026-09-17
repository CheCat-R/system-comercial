/**
 * Blog — notas, categorías y autores.
 *
 * Una nota **es una `Page`** con `type: "post"` (mismo editor, mismas versiones,
 * mismo motor de publicación) más un objeto `post` con lo que sólo tiene una nota:
 * extracto, autor, categorías, portada y fecha de publicación.
 *
 * Las categorías de blog están separadas de las de producto **a propósito**:
 * responden a preguntas distintas y no deberían mezclarse en el mismo taxonómico.
 *
 * Ver docs/MODULO-TIENDA-CMS.md §2.1 y §9.7.
 */
import { atDaysAgo } from "../lib/time";

export const authors = [
  { id: "AU-1", name: "Paula Ferreyra", role: "Editora", bio: "Corre desde los 14. Escribe sobre entrenamiento y equipo desde 2019.", avatarColor: "#4f46e5" },
  { id: "AU-2", name: "Nicolás Barrios", role: "Producto", bio: "Prueba cada zapatilla del catálogo antes de que se publique.", avatarColor: "#0f766e" },
  { id: "AU-3", name: "Equipo CheCAT", role: "Redacción", bio: "Notas colectivas del equipo.", avatarColor: "#b45309" },
];

export const postCategories = [
  { id: "PC-1", name: "Entrenamiento", slug: "entrenamiento", description: "Planes, ritmos y prevención de lesiones." },
  { id: "PC-2", name: "Equipo", slug: "equipo", description: "Reviews y guías de compra." },
  { id: "PC-3", name: "Comunidad", slug: "comunidad", description: "Carreras, salidas y gente." },
];

const section = (id, name, layout, blocks) => ({
  id, name,
  layout: { width: "narrow", background: "surface", spacing: "lg", columns: 1, columnRatio: "equal", mobileStack: true, ...layout },
  visibility: { mode: "always" },
  blocks,
});

const block = (id, type, props) => ({ id, type, props, visibility: { mode: "always" }, column: 0 });

/** Cuerpo estándar de una nota: la portada la pone `post-content`. */
const postBody = (id, body, extra = []) => ({
  sections: [
    section(`SC-${id}-1`, "Cuerpo", {}, [block(`BL-${id}-1`, "post-content", { showCover: true, showMeta: true })]),
    section(`SC-${id}-2`, "Texto", {}, [block(`BL-${id}-2`, "rich-text", { heading: "", body, align: "left", maxWidth: "prose" })]),
    ...extra,
  ],
});

const post = ({ id, slug, title, excerpt, authorId, categoryIds, coverMediaId, days, body, status = "publicada", extra = [] }) => {
  const tree = postBody(id, body, extra);
  return {
    id: `PG-${id}`, type: "post", slug, title,
    status, publishAt: null,
    seo: { title: `${title} — CheCAT`, description: excerpt, ogMediaId: coverMediaId, noindex: false },
    post: {
      excerpt, authorId, categoryIds, coverMediaId,
      publishedAt: status === "publicada" ? atDaysAgo(days, "10", "00") : null,
      readingMinutes: Math.max(2, Math.round(body.length / 900)),
    },
    draft: tree,
    published: status === "publicada" ? tree : null,
    createdAt: atDaysAgo(days + 2),
    updatedAt: atDaysAgo(days, "10", "05"),
    updatedBy: "Vos",
    publishedAt: status === "publicada" ? atDaysAgo(days, "10", "00") : null,
    publishedBy: status === "publicada" ? "Vos" : null,
  };
};

export const posts = [
  post({
    id: "P1", slug: "como-elegir-tu-primera-zapatilla-de-running",
    title: "Cómo elegir tu primera zapatilla de running",
    excerpt: "Amortiguación, drop y pisada explicados sin vueltas, para que la primera compra no sea a ciegas.",
    authorId: "AU-2", categoryIds: ["PC-2"], coverMediaId: "MD-12", days: 4,
    body: "La pregunta que más nos hacen en el local es siempre la misma: *¿cuál me llevo?*. La respuesta corta es que depende de tres cosas, y ninguna es la marca.\n\n**La superficie.** Si vas a correr en asfalto o cinta, buscá amortiguación y una suela lisa. Si vas a hacer montaña o tierra floja, necesitás tacos de al menos 4 mm y una placa de protección.\n\n**El drop.** Es la diferencia de altura entre talón y punta. Un drop alto (8-12 mm) acompaña a quien apoya de talón, que es la mayoría. Bajar el drop de golpe es la forma más común de terminar con el sóleo hecho un nudo.\n\n**Tu peso y tu kilometraje.** Una zapatilla liviana de competencia dura entre 300 y 500 km. Si recién arrancás y vas a sumar volumen, conviene una de entrenamiento diario: pesa un poco más y dura el doble.\n\nY una regla que no falla: comprala a la tarde, con la media que vas a usar, y dejá un dedo de espacio en la punta.",
  }),
  post({
    id: "P2", slug: "plan-de-10k-en-ocho-semanas",
    title: "Plan de 10K en ocho semanas",
    excerpt: "Un plan realista para quien ya corre 30 minutos seguidos y quiere una distancia concreta.",
    authorId: "AU-1", categoryIds: ["PC-1"], coverMediaId: "MD-13", days: 11,
    body: "Este plan asume que hoy podés correr 30 minutos continuos sin parar. Si todavía no llegás, dedicale tres semanas más a construir esa base: no hay atajo.\n\n**Semanas 1 a 3 — volumen.** Tres salidas por semana: dos suaves de 35-40 minutos y una larga que arranca en 50 y sube 5 minutos por semana. Todo a ritmo conversado: tenés que poder hablar.\n\n**Semanas 4 a 6 — calidad.** Reemplazá una salida suave por series: 6 × 400 m a ritmo fuerte con 90 segundos de trote entre cada una. La larga sigue creciendo hasta los 70 minutos.\n\n**Semanas 7 y 8 — afinar.** Bajá el volumen un 30 % y mantené la intensidad. La última semana es sólo dos trotes cortos y descanso.\n\nUna advertencia: **el día de descanso es parte del plan**, no un premio. La adaptación pasa cuando parás, no cuando corrés.",
  }),
  post({
    id: "P3", slug: "trail-ridge-400-km-despues",
    title: "Trail Ridge: 400 km después",
    excerpt: "Probamos la nueva Trail Ridge en barro, piedra y asfalto durante dos meses. Esto aguantó y esto no.",
    authorId: "AU-2", categoryIds: ["PC-2", "PC-1"], coverMediaId: "MD-2", days: 20,
    body: "Cuando entró la Trail Ridge al catálogo prometimos no publicarla hasta tener kilómetros encima. Van 400 y ya podemos hablar.\n\n**Lo que funciona.** El agarre en barro es notablemente mejor que el de su antecesora: los tacos de 5 mm evacúan bien y no se llenan. La placa de protección se nota en piedra suelta, donde antes terminabas con la planta molida.\n\n**Lo que no.** El upper se ensucia con una facilidad que da bronca, y a los 300 km la malla de la puntera empezó a abrirse en el par que más usamos. No es un problema estructural, pero conviene saberlo.\n\n**Para quién es.** Para terreno técnico de verdad. Si tu salida es un camino de tierra prolijo, es más zapatilla de la que necesitás.",
  }),
  post({
    id: "P4", slug: "que-llevar-a-una-carrera-de-montana",
    title: "Qué llevar a una carrera de montaña",
    excerpt: "La lista corta de lo obligatorio, lo útil y lo que vas a cargar sin usar.",
    authorId: "AU-3", categoryIds: ["PC-1", "PC-3"], coverMediaId: "MD-14", days: 38,
    body: "Casi todas las carreras de montaña tienen material obligatorio. Revisalo con tiempo: en varias te dejan afuera en el control de bolsos.\n\n**Obligatorio casi siempre:** manta térmica, silbato, campera cortaviento con capucha, vaso plegable y reserva de agua de un litro.\n\n**Útil de verdad:** gel o barra cada 45 minutos, una buff, y guantes finos si largás temprano.\n\n**Lo que vas a cargar sin usar:** el segundo par de medias, la cámara, y ese abrigo extra que metiste por las dudas. Cargar de más cansa más de lo que parece.",
  }),
  post({
    id: "P5", slug: "salida-grupal-de-septiembre",
    title: "Salida grupal de septiembre",
    excerpt: "Nos juntamos el último domingo del mes. Diez kilómetros suaves y desayuno.",
    authorId: "AU-3", categoryIds: ["PC-3"], coverMediaId: null, days: 1,
    status: "borrador",
    body: "Estamos armando la salida del último domingo. La idea es la de siempre: diez kilómetros a ritmo conversado, sin cronómetro, y desayuno después.\n\n*(Falta confirmar el punto de encuentro y el horario.)*",
  }),
];
