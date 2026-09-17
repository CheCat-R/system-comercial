/**
 * Despachador de bloques: `type` → renderer.
 *
 * Es el único punto de entrada del renderer. Los componentes viven por familia
 * (`commerce`, `presentation`, `conversion`, `editorial`, `utility`) para que
 * agregar un bloque sea tocar un archivo chico y no uno de mil líneas.
 */
import { Placeholder } from "./primitives";
import {
  ProductGrid, ProductCarousel, ProductSpotlight, CollectionGrid,
  CategoryNav, BrandStrip, PromoBanner, Countdown,
} from "./commerce";
import { Hero, RichText, ImageBlock, ImageText, Video, Gallery } from "./presentation";
import { UspBar, Cta, Testimonials, Faq, Newsletter, StoreLocator } from "./conversion";
import { PostList, PostContent, AuthorCard } from "./editorial";
import { Spacer, Divider, HtmlEmbed } from "./utility";

const RENDERERS = {
  // Comercio
  "product-grid": ProductGrid,
  "product-carousel": ProductCarousel,
  "product-spotlight": ProductSpotlight,
  "collection-grid": CollectionGrid,
  "category-nav": CategoryNav,
  "brand-strip": BrandStrip,
  "promo-banner": PromoBanner,
  countdown: Countdown,
  // Presentación
  hero: Hero,
  "rich-text": RichText,
  image: ImageBlock,
  "image-text": ImageText,
  video: Video,
  gallery: Gallery,
  // Conversión
  "usp-bar": UspBar,
  cta: Cta,
  testimonials: Testimonials,
  faq: Faq,
  newsletter: Newsletter,
  "store-locator": StoreLocator,
  // Editorial
  "post-list": PostList,
  "post-content": PostContent,
  "author-card": AuthorCard,
  // Utilidad
  spacer: Spacer,
  divider: Divider,
  "html-embed": HtmlEmbed,
};

/**
 * Un bloque desconocido (de una versión anterior del catálogo) avisa en vez de
 * romper la página — regla §10.9.
 */
const BlockRenderer = ({ type, props = {}, data = {} }) => {
  const Renderer = RENDERERS[type];
  if (!Renderer) return <Placeholder>No hay renderer para el bloque «{type}».</Placeholder>;
  return <Renderer props={props} data={data} />;
};

export default BlockRenderer;
