/**
 * Familia Comercio — lo que diferencia esto de un CMS genérico.
 *
 * Cada renderer recibe `{ props, data }`: `props` es lo que guardó el editor y
 * `data` lo que ya resolvió `tiendaApi.resolveBlockData`. Ningún renderer
 * consulta datos por su cuenta.
 */
import MediaBox from "../MediaBox";
import ProductCard from "../ProductCard";
import { Placeholder, SectionHeading, Stars } from "./primitives";
import { money } from "../../../lib/time";

export const ProductGrid = ({ props, data }) => {
  const products = data.products || [];
  if (!data.collection) return <Placeholder>Falta elegir una colección.</Placeholder>;
  if (!products.length) {
    return <Placeholder>La colección «{data.collection.name}» no devuelve productos con esta configuración.</Placeholder>;
  }

  return (
    <div className="st-block">
      <SectionHeading action={props.ctaLabel ? <span className="st-btn st-btn--ghost">{props.ctaLabel}</span> : null}>
        {props.heading}
      </SectionHeading>
      <div className="st-grid" style={{ "--st-cols": props.columns || 4 }}>
        {products.map((p) => (
          <ProductCard
            key={p.id} product={p} cardStyle={props.cardStyle}
            showPrice={props.showPrice} showBadge={props.showBadge} showRating={props.showRating}
          />
        ))}
      </div>
      {data.hiddenByStock > 0 && (
        <p className="st-note">{data.hiddenByStock} producto(s) sin stock ocultos.</p>
      )}
    </div>
  );
};

export const ProductCarousel = ({ props, data }) => {
  const products = data.products || [];
  if (!data.collection) return <Placeholder>Falta elegir una colección.</Placeholder>;
  if (!products.length) {
    return <Placeholder>La colección «{data.collection.name}» no devuelve productos con esta configuración.</Placeholder>;
  }

  return (
    <div className="st-block">
      <SectionHeading>{props.heading}</SectionHeading>
      <div className="st-rail">
        {products.map((p) => (
          <div className="st-rail__item" key={p.id}>
            <ProductCard product={p} cardStyle={props.cardStyle} showPrice={props.showPrice} showBadge={props.showBadge} />
          </div>
        ))}
      </div>
    </div>
  );
};

export const ProductSpotlight = ({ props, data }) => {
  const p = data.product;
  if (!p) return <Placeholder>Falta elegir un producto.</Placeholder>;

  return (
    <div className={`st-split ${props.imageSide === "right" ? "st-split--reverse" : ""}`.trim()}>
      <div className="st-split__media">
        <div
          className="st-spotlight__media"
          style={{ background: `linear-gradient(150deg, ${p.mediaColor} 0%, ${p.mediaColor}a0 60%, ${p.mediaColor}60 100%)` }}
          role="img"
          aria-label={p.name}
        >
          {p.onSale && <span className="st-card__badge st-card__badge--sale">−{p.discountPercent} %</span>}
        </div>
      </div>

      <div className="st-split__text">
        <span className="st-card__brand">{p.brandName}</span>
        <h3 className="st-prose__heading">{p.name}</h3>

        {props.showRating && (
          <span className="st-card__rating">
            <Stars rating={p.rating} />
            {p.rating.toFixed(1).replace(".", ",")} <em>({p.reviewCount} valoraciones)</em>
          </span>
        )}

        <p className="st-spotlight__desc">{p.description}</p>

        {props.showPrice && (
          <div className="st-card__prices">
            <strong className="st-spotlight__price">{money(p.price)}</strong>
            {p.onSale && <s className="st-card__compare">{money(p.compareAtPrice)}</s>}
          </div>
        )}

        {props.showStock && (
          <span className={`st-spotlight__stock ${p.inStock ? "" : "is-out"}`.trim()}>
            {p.inStock ? `${p.stock} disponibles` : "Sin stock"}
          </span>
        )}

        {props.ctaLabel && <span className="st-btn st-btn--primary">{props.ctaLabel}</span>}
      </div>
    </div>
  );
};

export const CollectionGrid = ({ props, data }) => {
  const items = data.items || [];
  if (!items.length) return <Placeholder>Agregá al menos una colección.</Placeholder>;

  const ratio = { square: "1:1", wide: "4:3", tall: "3:4" }[props.aspect] || "4:3";

  return (
    <div className="st-block">
      <SectionHeading>{props.heading}</SectionHeading>
      <div className="st-grid" style={{ "--st-cols": props.columns || 3 }}>
        {items.map((it) => (
          <div className="st-coltile" key={it._id || it.collectionId}>
            <MediaBox media={it.media} ratio={ratio} alt={it.label}>
              <span className="st-coltile__scrim" />
              <span className="st-coltile__label">
                {it.label}
                <em>{it.productCount} productos</em>
              </span>
            </MediaBox>
          </div>
        ))}
      </div>
    </div>
  );
};

export const CategoryNav = ({ props, data }) => {
  const categories = data.categories || [];
  if (!categories.length) return <Placeholder>No hay categorías en el catálogo.</Placeholder>;

  return (
    <div className="st-block">
      <SectionHeading>{props.heading}</SectionHeading>
      <div className={`st-catnav st-catnav--${props.style || "chips"}`}>
        {categories.map((c) => (
          <span className="st-catnav__item" key={c.id}>
            {c.name}
            {props.showCount && <em>{c.productCount}</em>}
          </span>
        ))}
      </div>
    </div>
  );
};

export const BrandStrip = ({ props, data }) => {
  const brands = data.brands || [];
  if (!brands.length) return <Placeholder>No hay marcas en el catálogo.</Placeholder>;

  return (
    <div className="st-block">
      <SectionHeading>{props.heading}</SectionHeading>
      <div
        className={`st-brands ${props.muted ? "st-brands--muted" : ""}`.trim()}
        style={{ "--st-cols": props.columns || 4 }}
      >
        {brands.map((b) => (
          <span className="st-brands__item" key={b.id}>{b.name}</span>
        ))}
      </div>
    </div>
  );
};

/**
 * La fecha de fin **no** se guarda acá: sale de la promoción de Marketing. Si la
 * promo se extiende, la cuenta regresiva se corrige sola.
 */
export const Countdown = ({ props, data }) => {
  if (!data.promotion) return <Placeholder>Falta elegir una promoción.</Placeholder>;
  if (!data.endsAt) return <Placeholder>«{data.promotion.name}» no tiene fecha de fin.</Placeholder>;

  if (data.expired) {
    return props.expiredBehavior === "message"
      ? <Placeholder>Esta oferta ya terminó.</Placeholder>
      : null;
  }

  return (
    <div className="st-countdown">
      <h3 className="st-countdown__heading">{props.heading}</h3>
      <div className="st-countdown__clock">
        {data.parts.map((p) => (
          <span className="st-countdown__unit" key={p.label}>
            <strong>{String(p.value).padStart(2, "0")}</strong>
            <em>{p.label}</em>
          </span>
        ))}
      </div>
      <span className="st-countdown__promo">{data.promotion.name}</span>
      {props.ctaLabel && <span className="st-btn st-btn--primary">{props.ctaLabel}</span>}
    </div>
  );
};

export const PromoBanner = ({ props, data }) => {
  const banner = data.banner;
  if (!banner) return <Placeholder>Falta elegir un banner.</Placeholder>;

  return (
    <div className={`st-promo st-promo--${props.size || "inset"} st-promo--${banner.theme || "light"}`}>
      <MediaBox media={banner.media} ratio="auto" alt={banner.headline} className="st-promo__media">
        <span className="st-promo__scrim" />
        <div className={`st-promo__content st-promo__content--${banner.position || "center"}`}>
          {banner.headline && <h3 className="st-promo__headline">{banner.headline}</h3>}
          {banner.subheadline && <p className="st-promo__sub">{banner.subheadline}</p>}
          {props.showCouponCode && data.promotion && (
            <span className="st-promo__code">Código: {data.promotion.name}</span>
          )}
          {banner.cta?.label && <span className="st-btn st-btn--primary">{banner.cta.label}</span>}
        </div>
      </MediaBox>
    </div>
  );
};
