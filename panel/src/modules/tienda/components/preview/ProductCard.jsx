/**
 * Tarjeta de producto de la tienda.
 *
 * Es la pieza que más se repite en el frente, así que vive una sola vez: los
 * bloques `product-grid` y `product-carousel` la comparten y sólo cambian la
 * variante (`default` | `minimal`).
 */
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import { money } from "../../lib/time";

const ProductCard = ({ product, cardStyle = "default", showPrice = true, showBadge = true, showRating = false }) => {
  const minimal = cardStyle === "minimal";

  return (
    <article className={`st-card ${minimal ? "st-card--minimal" : ""}`.trim()}>
      <div
        className="st-card__media"
        style={{ background: `linear-gradient(150deg, ${product.mediaColor} 0%, ${product.mediaColor}a0 60%, ${product.mediaColor}60 100%)` }}
        role="img"
        aria-label={product.name}
      >
        {showBadge && product.onSale && (
          <span className="st-card__badge st-card__badge--sale">−{product.discountPercent} %</span>
        )}
        {!product.inStock && <span className="st-card__badge st-card__badge--out">Sin stock</span>}
      </div>

      <div className="st-card__body">
        {!minimal && <span className="st-card__brand">{product.brandName}</span>}
        <h4 className="st-card__name">{product.name}</h4>

        {showRating && (
          <span className="st-card__rating">
            <StarRoundedIcon sx={{ fontSize: 15 }} />
            {product.rating.toFixed(1).replace(".", ",")}
            <em>({product.reviewCount})</em>
          </span>
        )}

        {showPrice && (
          <div className="st-card__prices">
            <strong className="st-card__price">{money(product.price)}</strong>
            {product.onSale && <s className="st-card__compare">{money(product.compareAtPrice)}</s>}
          </div>
        )}
      </div>
    </article>
  );
};

export default ProductCard;
