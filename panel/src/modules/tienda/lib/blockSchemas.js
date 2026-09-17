/**
 * ⭐ El catálogo de bloques.
 *
 * Cada tipo se declara **una sola vez** acá. De este archivo salen:
 *   · el ítem del selector de bloques (familia, ícono, nombre, descripción)
 *   · el formulario del inspector — se genera solo, campo por campo
 *   · los valores por defecto al insertar
 *   · la validación y la etiqueta que muestra el outline
 *
 * El catálogo es **cerrado**: agregar un tipo = una entrada acá + un renderer en
 * `components/preview/blocks/`. Eso es lo que mantiene el sistema controlado y
 * permite rediseñar todos los bloques de un tipo de una sola vez.
 *
 * Ver docs/MODULO-TIENDA-CMS.md §3.
 */
import ViewCarouselOutlinedIcon from "@mui/icons-material/ViewCarouselOutlined";
import GridViewOutlinedIcon from "@mui/icons-material/GridViewOutlined";
import ViewWeekOutlinedIcon from "@mui/icons-material/ViewWeekOutlined";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import LocalOfferOutlinedIcon from "@mui/icons-material/LocalOfferOutlined";
import TextFieldsOutlinedIcon from "@mui/icons-material/TextFieldsOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import VerticalSplitOutlinedIcon from "@mui/icons-material/VerticalSplitOutlined";
import VerifiedOutlinedIcon from "@mui/icons-material/VerifiedOutlined";
import CampaignOutlinedIcon from "@mui/icons-material/CampaignOutlined";
import HeightOutlinedIcon from "@mui/icons-material/HeightOutlined";
import HorizontalRuleOutlinedIcon from "@mui/icons-material/HorizontalRuleOutlined";
import LocalMallOutlinedIcon from "@mui/icons-material/LocalMallOutlined";
import SellOutlinedIcon from "@mui/icons-material/SellOutlined";
import LoyaltyOutlinedIcon from "@mui/icons-material/LoyaltyOutlined";
import PlayCircleOutlinedIcon from "@mui/icons-material/PlayCircleOutlined";
import CollectionsOutlinedIcon from "@mui/icons-material/CollectionsOutlined";
import FormatQuoteOutlinedIcon from "@mui/icons-material/FormatQuoteOutlined";
import QuizOutlinedIcon from "@mui/icons-material/QuizOutlined";
import AlternateEmailOutlinedIcon from "@mui/icons-material/AlternateEmailOutlined";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import NotesOutlinedIcon from "@mui/icons-material/NotesOutlined";
import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import CodeOutlinedIcon from "@mui/icons-material/CodeOutlined";

/** Familias del selector, en el orden en que se muestran. */
export const FAMILIES = [
  { key: "comercio", label: "Comercio", hint: "Lo que vende: productos, colecciones, ofertas" },
  { key: "presentacion", label: "Presentación", hint: "Imágenes, texto y portadas" },
  { key: "conversion", label: "Conversión", hint: "Confianza, dudas y captura de contactos" },
  { key: "editorial", label: "Editorial", hint: "Notas del blog y firmas" },
  { key: "utilidad", label: "Utilidad", hint: "Espaciado y separadores" },
];

/** Set cerrado de íconos disponibles para el control `icon` (barra de beneficios). */
export const CONTENT_ICONS = [
  { value: "truck", label: "Envío" },
  { value: "shield", label: "Garantía" },
  { value: "card", label: "Pago" },
  { value: "refresh", label: "Cambios" },
  { value: "clock", label: "Rapidez" },
  { value: "star", label: "Calidad" },
  { value: "gift", label: "Regalo" },
  { value: "lock", label: "Seguridad" },
];

export const BLOCK_SCHEMAS = {
  /* ------------------------------------------------------------- COMERCIO */

  "product-grid": {
    label: "Grilla de productos",
    family: "comercio",
    icon: GridViewOutlinedIcon,
    description: "Los productos de una colección, en grilla.",
    fields: [
      { key: "heading", label: "Título", control: "text", default: "", maxLength: 60, placeholder: "Opcional" },
      { key: "collectionId", label: "Colección", control: "collection", required: true },
      { key: "columns", label: "Columnas", control: "segmented", options: [2, 3, 4], default: 4 },
      { key: "limit", label: "Cantidad", control: "number", min: 2, max: 24, default: 8 },
      {
        key: "cardStyle", label: "Estilo de tarjeta", control: "select", default: "default",
        options: [{ value: "default", label: "Con detalle" }, { value: "minimal", label: "Minimal" }],
      },
      { key: "showPrice", label: "Mostrar precio", control: "switch", default: true },
      { key: "showBadge", label: "Mostrar badge de oferta", control: "switch", default: true },
      { key: "showRating", label: "Mostrar valoración", control: "switch", default: false },
      { key: "hideOutOfStock", label: "Ocultar productos sin stock", control: "switch", default: true },
      { key: "ctaLabel", label: "Texto del botón", control: "text", default: "Ver todo", maxLength: 24 },
      { key: "ctaHref", label: "Destino del botón", control: "link", default: "" },
    ],
    summary: (props, ctx) => ctx.collectionName || "⚠ Sin colección",
  },

  "product-carousel": {
    label: "Carrusel de productos",
    family: "comercio",
    icon: ViewWeekOutlinedIcon,
    description: "Los mismos productos, en fila desplazable.",
    fields: [
      { key: "heading", label: "Título", control: "text", default: "También te puede gustar", maxLength: 60 },
      { key: "collectionId", label: "Colección", control: "collection", required: true },
      { key: "limit", label: "Cantidad", control: "number", min: 3, max: 24, default: 10 },
      {
        key: "cardStyle", label: "Estilo de tarjeta", control: "select", default: "minimal",
        options: [{ value: "default", label: "Con detalle" }, { value: "minimal", label: "Minimal" }],
      },
      { key: "showPrice", label: "Mostrar precio", control: "switch", default: true },
      { key: "showBadge", label: "Mostrar badge de oferta", control: "switch", default: true },
      { key: "hideOutOfStock", label: "Ocultar productos sin stock", control: "switch", default: true },
    ],
    summary: (props, ctx) => ctx.collectionName || "⚠ Sin colección",
  },

  "collection-grid": {
    label: "Grilla de colecciones",
    family: "comercio",
    icon: CategoryOutlinedIcon,
    description: "Tarjetas para entrar a cada colección o categoría.",
    fields: [
      { key: "heading", label: "Título", control: "text", default: "Comprá por categoría", maxLength: 60 },
      {
        key: "items", label: "Colecciones", control: "repeater", default: [], min: 1, max: 8,
        itemLabel: (item, ctx) => ctx?.collectionNames?.[item.collectionId] || item.label || "Colección",
        fields: [
          { key: "collectionId", label: "Colección", control: "collection", required: true },
          { key: "label", label: "Texto (opcional)", control: "text", default: "", maxLength: 32 },
          { key: "mediaId", label: "Imagen", control: "media" },
        ],
      },
      { key: "columns", label: "Columnas", control: "segmented", options: [2, 3, 4], default: 3 },
      {
        key: "aspect", label: "Proporción", control: "select", default: "wide",
        options: [{ value: "square", label: "Cuadrada" }, { value: "wide", label: "Apaisada" }, { value: "tall", label: "Vertical" }],
      },
    ],
    summary: (props) => `${props.items?.length || 0} colecciones`,
  },

  "product-spotlight": {
    label: "Producto destacado",
    family: "comercio",
    icon: LocalMallOutlinedIcon,
    description: "Un solo producto, en grande, con su ficha.",
    fields: [
      { key: "productId", label: "Producto", control: "product", required: true },
      {
        key: "imageSide", label: "Imagen a la", control: "segmented", default: "left",
        options: [{ value: "left", label: "Izquierda" }, { value: "right", label: "Derecha" }],
      },
      { key: "showPrice", label: "Mostrar precio", control: "switch", default: true },
      { key: "showStock", label: "Mostrar disponibilidad", control: "switch", default: true },
      { key: "showRating", label: "Mostrar valoración", control: "switch", default: true },
      { key: "ctaLabel", label: "Texto del botón", control: "text", default: "Ver el producto", maxLength: 24 },
    ],
    summary: (props, ctx) => ctx.productName || "⚠ Sin producto",
  },

  "category-nav": {
    label: "Navegación por categorías",
    family: "comercio",
    icon: SellOutlinedIcon,
    description: "Atajos a las categorías del catálogo.",
    fields: [
      { key: "heading", label: "Título", control: "text", default: "", maxLength: 60, placeholder: "Opcional" },
      { key: "categoryIds", label: "Categorías", control: "category-list", default: [], hint: "Vacío = todas." },
      {
        key: "style", label: "Estilo", control: "segmented", default: "chips",
        options: [{ value: "chips", label: "Chips" }, { value: "list", label: "Lista" }],
      },
      { key: "showCount", label: "Mostrar cantidad de productos", control: "switch", default: true },
    ],
    summary: (props) => (props.categoryIds?.length ? `${props.categoryIds.length} categorías` : "Todas las categorías"),
  },

  "brand-strip": {
    label: "Tira de marcas",
    family: "comercio",
    icon: LoyaltyOutlinedIcon,
    description: "Las marcas del catálogo, en fila.",
    fields: [
      { key: "heading", label: "Título", control: "text", default: "", maxLength: 60, placeholder: "Opcional" },
      { key: "brandIds", label: "Marcas", control: "brand-list", default: [], hint: "Vacío = todas." },
      { key: "columns", label: "Por fila", control: "segmented", options: [3, 4, 6], default: 4 },
      { key: "muted", label: "Atenuar", control: "switch", default: true },
    ],
    summary: (props) => (props.brandIds?.length ? `${props.brandIds.length} marcas` : "Todas las marcas"),
  },

  "promo-banner": {
    label: "Banner promocional",
    family: "comercio",
    icon: LocalOfferOutlinedIcon,
    description: "Una creatividad de la biblioteca, con su oferta.",
    fields: [
      { key: "bannerId", label: "Banner", control: "banner", required: true },
      { key: "promotionId", label: "Promoción vinculada", control: "promotion", default: "" },
      { key: "showCouponCode", label: "Mostrar código de cupón", control: "switch", default: false },
      {
        key: "size", label: "Tamaño", control: "segmented", default: "inset",
        options: [{ value: "inset", label: "Contenido" }, { value: "full", label: "Completo" }],
      },
    ],
    summary: (props, ctx) => ctx.bannerName || "⚠ Sin banner",
  },

  countdown: {
    label: "Cuenta regresiva",
    family: "comercio",
    icon: TimerOutlinedIcon,
    description: "Cuánto falta para que termine una promoción.",
    fields: [
      { key: "promotionId", label: "Promoción", control: "promotion", required: true, hint: "La fecha de fin sale de Marketing." },
      { key: "heading", label: "Título", control: "text", default: "La oferta termina en", maxLength: 60 },
      { key: "ctaLabel", label: "Texto del botón", control: "text", default: "", maxLength: 24 },
      { key: "ctaHref", label: "Destino del botón", control: "link", default: "" },
      {
        key: "expiredBehavior", label: "Cuando ya terminó", control: "segmented", default: "hide",
        options: [{ value: "hide", label: "Ocultar" }, { value: "message", label: "Mostrar aviso" }],
      },
    ],
    summary: (props, ctx) => ctx.promotionName || "⚠ Sin promoción",
  },

  /* --------------------------------------------------------- PRESENTACIÓN */

  hero: {
    label: "Hero / Slider",
    family: "presentacion",
    icon: ViewCarouselOutlinedIcon,
    description: "La portada. Uno o varios banners rotando.",
    maxPerPage: 1,
    fields: [
      { key: "bannerIds", label: "Banners", control: "banner-list", default: [], min: 1, max: 5, required: true },
      {
        key: "height", label: "Altura", control: "segmented", default: "lg",
        options: [{ value: "sm", label: "Baja" }, { value: "md", label: "Media" }, { value: "lg", label: "Alta" }],
      },
      { key: "autoplayMs", label: "Rotación (ms, 0 = sin rotar)", control: "number", min: 0, max: 15000, step: 500, default: 6000 },
      { key: "showDots", label: "Mostrar indicadores", control: "switch", default: true },
      { key: "overlay", label: "Oscurecer imagen (%)", control: "number", min: 0, max: 60, default: 25 },
    ],
    summary: (props) => `${props.bannerIds?.length || 0} banners`,
  },

  "rich-text": {
    label: "Texto",
    family: "presentacion",
    icon: TextFieldsOutlinedIcon,
    description: "Título y cuerpo. El único bloque de texto libre.",
    fields: [
      { key: "heading", label: "Título", control: "text", default: "", maxLength: 80 },
      { key: "body", label: "Cuerpo", control: "richtext", default: "", rows: 6 },
      {
        key: "align", label: "Alineación", control: "segmented", default: "left",
        options: [{ value: "left", label: "Izq." }, { value: "center", label: "Centro" }],
      },
      {
        key: "maxWidth", label: "Ancho del texto", control: "select", default: "prose",
        options: [{ value: "prose", label: "Legible (65 car.)" }, { value: "full", label: "Todo el ancho" }],
      },
    ],
    summary: (props) => props.heading || "Texto",
  },

  image: {
    label: "Imagen",
    family: "presentacion",
    icon: ImageOutlinedIcon,
    description: "Una imagen, opcionalmente enlazada.",
    fields: [
      { key: "mediaId", label: "Imagen", control: "media", required: true },
      { key: "mediaMobileId", label: "Imagen para mobile", control: "media", default: "" },
      { key: "alt", label: "Texto alternativo", control: "text", default: "", maxLength: 120, hint: "Para accesibilidad y SEO." },
      { key: "href", label: "Enlace", control: "link", default: "" },
      {
        key: "ratio", label: "Proporción", control: "select", default: "auto",
        options: [
          { value: "auto", label: "Original" }, { value: "16:9", label: "16:9" },
          { value: "4:3", label: "4:3" }, { value: "1:1", label: "Cuadrada" },
        ],
      },
    ],
    summary: (props, ctx) => ctx.mediaName || "⚠ Sin imagen",
  },

  "image-text": {
    label: "Imagen + texto",
    family: "presentacion",
    icon: VerticalSplitOutlinedIcon,
    description: "Media imagen, media texto. Para contar algo.",
    fields: [
      { key: "mediaId", label: "Imagen", control: "media", required: true },
      {
        key: "imageSide", label: "Imagen a la", control: "segmented", default: "left",
        options: [{ value: "left", label: "Izquierda" }, { value: "right", label: "Derecha" }],
      },
      { key: "heading", label: "Título", control: "text", default: "", maxLength: 70 },
      { key: "body", label: "Texto", control: "richtext", default: "", rows: 5 },
      { key: "ctaLabel", label: "Texto del botón", control: "text", default: "", maxLength: 24 },
      { key: "ctaHref", label: "Destino del botón", control: "link", default: "" },
    ],
    summary: (props) => props.heading || "Imagen + texto",
  },

  video: {
    label: "Video",
    family: "presentacion",
    icon: PlayCircleOutlinedIcon,
    description: "Un video embebido, con portada.",
    fields: [
      { key: "url", label: "URL del video", control: "link", required: true, hint: "YouTube, Vimeo o un archivo." },
      { key: "posterMediaId", label: "Portada", control: "media", default: "" },
      { key: "caption", label: "Epígrafe", control: "text", default: "", maxLength: 120 },
      {
        key: "ratio", label: "Proporción", control: "select", default: "16:9",
        options: [{ value: "16:9", label: "16:9" }, { value: "4:3", label: "4:3" }, { value: "1:1", label: "Cuadrada" }],
      },
      { key: "autoplay", label: "Reproducir solo", control: "switch", default: false },
      { key: "muted", label: "Silenciado", control: "switch", default: true },
    ],
    summary: (props) => props.caption || (props.url ? "Video" : "⚠ Sin URL"),
  },

  gallery: {
    label: "Galería",
    family: "presentacion",
    icon: CollectionsOutlinedIcon,
    description: "Varias imágenes en grilla.",
    fields: [
      { key: "heading", label: "Título", control: "text", default: "", maxLength: 60, placeholder: "Opcional" },
      { key: "mediaIds", label: "Imágenes", control: "media-list", default: [], min: 2, max: 12, required: true },
      { key: "columns", label: "Columnas", control: "segmented", options: [2, 3, 4], default: 3 },
      {
        key: "aspect", label: "Proporción", control: "select", default: "square",
        options: [{ value: "square", label: "Cuadrada" }, { value: "wide", label: "Apaisada" }, { value: "tall", label: "Vertical" }],
      },
    ],
    summary: (props) => `${props.mediaIds?.length || 0} imágenes`,
  },

  /* ------------------------------------------------------------ CONVERSIÓN */

  "usp-bar": {
    label: "Barra de beneficios",
    family: "conversion",
    icon: VerifiedOutlinedIcon,
    description: "Envío, cuotas, cambios: lo que da confianza.",
    fields: [
      {
        key: "items", label: "Beneficios", control: "repeater", default: [], min: 2, max: 4,
        itemLabel: (item) => item.title || "Beneficio",
        fields: [
          { key: "icon", label: "Ícono", control: "icon", default: "truck" },
          { key: "title", label: "Título", control: "text", default: "", maxLength: 28, required: true },
          { key: "subtitle", label: "Detalle", control: "text", default: "", maxLength: 44 },
        ],
      },
      {
        key: "layout", label: "Estilo", control: "segmented", default: "inline",
        options: [{ value: "inline", label: "En línea" }, { value: "cards", label: "Tarjetas" }],
      },
    ],
    summary: (props) => `${props.items?.length || 0} beneficios`,
  },

  cta: {
    label: "Llamado a la acción",
    family: "conversion",
    icon: CampaignOutlinedIcon,
    description: "Un mensaje y un botón. Nada más.",
    fields: [
      { key: "heading", label: "Título", control: "text", default: "", maxLength: 70, required: true },
      { key: "body", label: "Bajada", control: "textarea", default: "", rows: 3, maxLength: 180 },
      { key: "buttonLabel", label: "Texto del botón", control: "text", default: "Ver más", maxLength: 24 },
      { key: "buttonHref", label: "Destino del botón", control: "link", default: "" },
      {
        key: "tone", label: "Tono", control: "segmented", default: "accent",
        options: [{ value: "accent", label: "Acento" }, { value: "neutral", label: "Neutro" }],
      },
    ],
    summary: (props) => props.heading || "Llamado a la acción",
  },

  testimonials: {
    label: "Testimonios",
    family: "conversion",
    icon: FormatQuoteOutlinedIcon,
    description: "Reseñas del catálogo o testimonios cargados a mano.",
    fields: [
      { key: "heading", label: "Título", control: "text", default: "Lo que dicen", maxLength: 60 },
      {
        key: "source", label: "De dónde salen", control: "segmented", default: "reviews",
        options: [{ value: "reviews", label: "Valoraciones" }, { value: "manual", label: "A mano" }],
      },
      { key: "minRating", label: "Puntaje mínimo", control: "number", min: 1, max: 5, default: 4, showIf: { source: "reviews" } },
      { key: "limit", label: "Cantidad", control: "number", min: 1, max: 9, default: 3, showIf: { source: "reviews" } },
      {
        key: "items", label: "Testimonios", control: "repeater", default: [], max: 9, showIf: { source: "manual" },
        itemLabel: (item) => item.customer || "Testimonio",
        fields: [
          { key: "customer", label: "Nombre", control: "text", default: "", maxLength: 40, required: true },
          { key: "comment", label: "Comentario", control: "textarea", default: "", rows: 3, maxLength: 220 },
          { key: "rating", label: "Puntaje", control: "number", min: 1, max: 5, default: 5 },
        ],
      },
      {
        key: "layout", label: "Disposición", control: "segmented", default: "grid",
        options: [{ value: "grid", label: "Grilla" }, { value: "carousel", label: "Fila" }],
      },
    ],
    summary: (props) => (props.source === "manual" ? `${props.items?.length || 0} a mano` : `Valoraciones ${props.minRating}★+`),
  },

  faq: {
    label: "Preguntas frecuentes",
    family: "conversion",
    icon: QuizOutlinedIcon,
    description: "Acordeón de dudas y respuestas.",
    fields: [
      { key: "heading", label: "Título", control: "text", default: "Preguntas frecuentes", maxLength: 60 },
      {
        key: "items", label: "Preguntas", control: "repeater", default: [], min: 1, max: 12,
        itemLabel: (item) => item.q || "Pregunta",
        fields: [
          { key: "q", label: "Pregunta", control: "text", default: "", maxLength: 120, required: true },
          { key: "a", label: "Respuesta", control: "textarea", default: "", rows: 3, maxLength: 400 },
        ],
      },
      { key: "defaultOpenIndex", label: "Abrir de entrada (0 = la primera, −1 = ninguna)", control: "number", min: -1, max: 11, default: 0 },
    ],
    summary: (props) => `${props.items?.length || 0} preguntas`,
  },

  newsletter: {
    label: "Suscripción",
    family: "conversion",
    icon: AlternateEmailOutlinedIcon,
    description: "Captura de email. Escribe la suscripción en Marketing.",
    fields: [
      { key: "heading", label: "Título", control: "text", default: "Enterate antes que el resto", maxLength: 60, required: true },
      { key: "body", label: "Bajada", control: "textarea", default: "", rows: 2, maxLength: 180 },
      { key: "buttonLabel", label: "Texto del botón", control: "text", default: "Suscribirme", maxLength: 24 },
      {
        key: "channel", label: "Canal", control: "segmented", default: "email",
        options: [{ value: "email", label: "Email" }, { value: "whatsapp", label: "WhatsApp" }],
      },
      { key: "tagOnSubscribe", label: "Etiqueta al suscribirse", control: "text", default: "newsletter", maxLength: 24, hint: "Se usa después para armar audiencias en Marketing." },
    ],
    summary: (props) => props.heading || "Suscripción",
  },

  "store-locator": {
    label: "Sucursales",
    family: "conversion",
    icon: StorefrontOutlinedIcon,
    description: "Dónde retirar o probarse. Sale de Inventario.",
    fields: [
      { key: "heading", label: "Título", control: "text", default: "Dónde encontrarnos", maxLength: 60 },
      { key: "branchIds", label: "Sucursales", control: "branch-list", default: [], hint: "Vacío = todas las activas." },
      { key: "showHours", label: "Mostrar horarios", control: "switch", default: true },
      { key: "columns", label: "Columnas", control: "segmented", options: [1, 2, 3], default: 3 },
    ],
    summary: (props) => (props.branchIds?.length ? `${props.branchIds.length} sucursales` : "Todas las sucursales"),
  },

  /* ------------------------------------------------------------- EDITORIAL */

  "post-list": {
    label: "Últimas notas",
    family: "editorial",
    icon: ArticleOutlinedIcon,
    description: "Las notas publicadas del blog.",
    fields: [
      { key: "heading", label: "Título", control: "text", default: "Del blog", maxLength: 60 },
      { key: "categoryIds", label: "Categorías", control: "post-category-list", default: [], hint: "Vacío = todas." },
      { key: "limit", label: "Cantidad", control: "number", min: 1, max: 12, default: 3 },
      { key: "columns", label: "Columnas", control: "segmented", options: [2, 3, 4], default: 3 },
      { key: "showExcerpt", label: "Mostrar extracto", control: "switch", default: true },
      { key: "showAuthor", label: "Mostrar autor y fecha", control: "switch", default: true },
      { key: "ctaHref", label: "Enlace «ver todas»", control: "link", default: "/blog" },
    ],
    summary: (props) => (props.categoryIds?.length ? `${props.categoryIds.length} categorías` : "Todas las notas"),
  },

  "post-content": {
    label: "Cuerpo de la nota",
    family: "editorial",
    icon: NotesOutlinedIcon,
    description: "Portada, título y datos de la nota. Sólo en el blog.",
    allowedPageTypes: ["post"],
    maxPerPage: 1,
    fields: [
      { key: "showCover", label: "Mostrar portada", control: "switch", default: true },
      { key: "showMeta", label: "Mostrar autor, fecha y lectura", control: "switch", default: true },
    ],
    summary: () => "Encabezado de la nota",
  },

  "author-card": {
    label: "Ficha de autor",
    family: "editorial",
    icon: AccountCircleOutlinedIcon,
    description: "Quién escribe, con su bio.",
    fields: [
      { key: "authorId", label: "Autor", control: "author", required: true },
      { key: "showBio", label: "Mostrar bio", control: "switch", default: true },
    ],
    summary: (props, ctx) => ctx.authorName || "⚠ Sin autor",
  },

  /* -------------------------------------------------------------- UTILIDAD */

  spacer: {
    label: "Espaciador",
    family: "utilidad",
    icon: HeightOutlinedIcon,
    description: "Aire entre dos bloques.",
    fields: [
      {
        key: "size", label: "Alto", control: "segmented", default: "md",
        options: [{ value: "sm", label: "S" }, { value: "md", label: "M" }, { value: "lg", label: "L" }, { value: "xl", label: "XL" }],
      },
    ],
    summary: (props) => `Alto ${String(props.size || "md").toUpperCase()}`,
  },

  "html-embed": {
    label: "Embed externo",
    family: "utilidad",
    icon: CodeOutlinedIcon,
    description: "Un widget de terceros. Sólo para administradores.",
    adminOnly: true,
    fields: [
      { key: "code", label: "Código", control: "textarea", default: "", rows: 6, required: true, hint: "Se renderiza aislado. No pegues nada que no entiendas." },
      { key: "height", label: "Alto (px)", control: "number", min: 80, max: 900, default: 260 },
      { key: "caption", label: "Nota interna", control: "text", default: "", maxLength: 80, hint: "Para acordarte de qué es. No se muestra." },
    ],
    summary: (props) => props.caption || "Embed externo",
  },

  divider: {
    label: "Separador",
    family: "utilidad",
    icon: HorizontalRuleOutlinedIcon,
    description: "Una línea para cortar el ritmo.",
    fields: [
      {
        key: "style", label: "Estilo", control: "segmented", default: "line",
        options: [{ value: "line", label: "Línea" }, { value: "dots", label: "Puntos" }],
      },
      {
        key: "width", label: "Ancho", control: "segmented", default: "content",
        options: [{ value: "short", label: "Corto" }, { value: "content", label: "Contenido" }, { value: "full", label: "Completo" }],
      },
    ],
    summary: () => "Separador",
  },
};

export const getSchema = (type) => BLOCK_SCHEMAS[type] || null;

/**
 * Campos que corresponden mostrar con los valores actuales.
 * `showIf: { source: "manual" }` = este campo sólo aplica si `props.source === "manual"`.
 * Evita inspectores con la mitad de los campos sin sentido.
 */
export const visibleFields = (schema, props = {}) =>
  (schema?.fields || []).filter((f) =>
    !f.showIf || Object.entries(f.showIf).every(([key, value]) => props[key] === value)
  );

export const blockLabel = (type) => BLOCK_SCHEMAS[type]?.label || type;

/**
 * Tipos disponibles para un tipo de página, agrupados por familia.
 * `isAdmin` filtra los bloques restringidos (§11): el embed externo sólo lo ve
 * quien puede hacerse cargo de lo que pega adentro.
 */
export const blocksByFamily = (pageType, { isAdmin = false } = {}) =>
  FAMILIES.map((f) => ({
    ...f,
    blocks: Object.entries(BLOCK_SCHEMAS)
      .filter(([, s]) => s.family === f.key)
      .filter(([, s]) => !s.allowedPageTypes || s.allowedPageTypes.includes(pageType))
      .filter(([, s]) => !s.adminOnly || isAdmin)
      .map(([type, s]) => ({ type, ...s })),
  })).filter((f) => f.blocks.length > 0);
