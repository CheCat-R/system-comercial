import { useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import { applyDiscount } from "../lib/discounts";
import { money } from "../lib/time";
import "../Marketing.css";

/**
 * "Así se vería este descuento en un carrito de ejemplo". Calcula en el front con `applyDiscount`
 * (mismo motor que `priceCart`), sin persistir nada.
 */
const SAMPLE_CART = {
  items: [
    { skuId: "SKU-1", name: "Zapatillas Running X", category: "Calzado", qty: 1, unitPrice: 45000 },
    { skuId: "SKU-2", name: "Remera Básica Blanca", category: "Indumentaria", qty: 2, unitPrice: 12000 },
  ],
};
SAMPLE_CART.subtotal = SAMPLE_CART.items.reduce((s, it) => s + it.qty * it.unitPrice, 0);

const CartPreview = ({ discount }) => {
  const result = useMemo(() => applyDiscount(discount, SAMPLE_CART), [discount]);
  const shipping = result.freeShipping ? 0 : 3500;
  const taxable = SAMPLE_CART.subtotal - result.amount;
  const total = taxable + shipping + Math.round(taxable * 0.21);

  return (
    <Box className="mkt-cart-preview">
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>
        Carrito de ejemplo
      </Typography>
      {SAMPLE_CART.items.map((it) => (
        <div className="mkt-cart-preview__row" key={it.skuId}>
          <span>{it.name} × {it.qty}</span>
          <span className="mono">{money(it.qty * it.unitPrice)}</span>
        </div>
      ))}
      <div className="mkt-cart-preview__row"><span>Subtotal</span><span className="mono">{money(SAMPLE_CART.subtotal)}</span></div>
      {(result.amount > 0 || result.freeShipping) && (
        <div className="mkt-cart-preview__row mkt-cart-preview__row--disc">
          <span>Descuento</span>
          <span className="mono">{result.freeShipping ? "Envío gratis" : money(-result.amount)}</span>
        </div>
      )}
      <div className="mkt-cart-preview__row"><span>Envío</span><span className="mono">{money(shipping)}</span></div>
      <div className="mkt-cart-preview__row"><span>IVA 21%</span><span className="mono">{money(Math.round(taxable * 0.21))}</span></div>
      <div className="mkt-cart-preview__row mkt-cart-preview__row--total"><span>Total</span><span className="mono">{money(total)}</span></div>
    </Box>
  );
};

export default CartPreview;
