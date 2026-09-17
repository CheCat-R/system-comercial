/**
 * La ficha de un producto.
 *
 * ⭐ Antes esto era **un formulario que no guardaba nada**, con "Zapatillas
 * Running X" escrito a mano en el título y dos botones —"Descartar" y "Guardar
 * producto"— sin `onClick`. Un formulario que no persiste es peor que no tener
 * pantalla: enseña a desconfiar de todos los demás.
 *
 * Ahora es lo que el módulo puede sostener con verdad: **una ficha de lectura**
 * sobre `catalogApi`, con la única escritura que existe —el cambio de precio—
 * ofrecida donde corresponde, y su historial al lado.
 *
 * Cuando Productos tenga su capa de escritura, esta pantalla se convierte en el
 * formulario que quiso ser. Mientras tanto no promete lo que no puede cumplir.
 */
import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";
import Chip from "@mui/material/Chip";

import SellOutlinedIcon from "@mui/icons-material/SellOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";

import Button from "../../components/Button/Button";
import EntityHeader from "../../components/EntityHeader/EntityHeader";
import { useEntityLabel } from "../../components/Breadcrumbs/EntityLabelContext";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { getProduct, listPriceHistory, marginOf } from "./api/catalogApi";
import { getStockGroupedBySku } from "../inventario/api/inventoryApi";
import "./ProductoDetalle.css";

const money = (v) => (v == null ? "—" : `$${Math.round(v).toLocaleString("es-AR")}`);
const pct = (v) => (v == null ? "—" : `${(v * 100).toFixed(1)} %`);

const stamp = (iso) => new Date(iso).toLocaleString("es-AR", {
  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
});

const ProductoDetalle = () => {
  const { id } = useParams();
  const { setLabel } = useEntityLabel();
  const navigate = useNavigate();
  const [tick] = useState(0);

  const product = useMemo(() => getProduct(id), [id]);

  // ⭐ La miga de pan dice el nombre de la cosa, no la palabra «Detalle»: la
  // pantalla ya tiene la entidad cargada, sólo hace falta que lo cuente.
  useEffect(() => { if (product) setLabel(product.id, product.name); }, [product, setLabel]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const history = useMemo(() => listPriceHistory({ productId: id }), [id, tick]);

  /** El desglose por depósito lo sabe Inventario, no el catálogo (§ARCHITECTURE 1.1). */
  const stockRow = useMemo(() => {
    if (!product) return null;
    try {
      return getStockGroupedBySku().find((g) => g.skuId === product.sku || g.sku === product.sku) || null;
    } catch {
      return null;
    }
  }, [product]);

  if (!product) {
    return (
      <Box className="page fade-in">
        <Card className="entity-card">
          <Typography variant="h6" className="card-title">Ese producto no existe</Typography>
          <Typography variant="body2" className="text-secondary">
            No hay ningún producto con el identificador <code className="mono">{id}</code> en el
            catálogo.
          </Typography>
          <Button variant="primary" onClick={() => navigate("/productos")} sx={{ mt: 2 }}>
            Volver al catálogo
          </Button>
        </Card>
      </Box>
    );
  }

  const margin = marginOf(product.price, product.cost);

  return (
    <Box className="page fade-in">
      {/* ⭐ La primitiva hermana de `PageHeader`, para las pantallas de detalle.
          Esta es la primera que la usa; las otras ocho siguen con la clase
          suelta `entity-header` y se migran en la próxima pasada. */}
      <EntityHeader
        title={product.name}
        eyebrow={<span className="mono">SKU: {product.sku}</span>}
        badges={<StatusBadge status={product.status} />}
        onBack={() => navigate("/productos")}
        backLabel="Volver al catálogo"
        actions={(
          <>
            <Button
              variant="secondary"
              startIcon={<StorefrontOutlinedIcon />}
              onClick={() => navigate("/tienda")}
            >
              Ver en la tienda
            </Button>
            <Button
              variant="primary"
              startIcon={<SellOutlinedIcon />}
              onClick={() => navigate("/productos/precios")}
            >
              Cambiar el precio
            </Button>
          </>
        )}
      />

      <Grid container spacing={2}>
        {/* ------------------------------------------------ comercial */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Card className="entity-card">
            <Typography variant="h6" className="card-title">Ficha comercial</Typography>

            <Box className="pd-grid">
              <span>Nombre</span><div>{product.name}</div>
              <span>SKU</span><div className="mono">{product.sku}</div>
              <span>Categoría</span><div>{product.categoryName}</div>
              <span>Marca</span><div>{product.brandName}</div>
              <span>Etiquetas</span>
              <div className="pd-tags">
                {product.tags?.length
                  ? product.tags.map((t) => <Chip key={t.id} size="small" label={t.name} />)
                  : <em className="text-tertiary">sin etiquetas</em>}
              </div>
              {product.description && (<><span>Descripción</span><div>{product.description}</div></>)}
            </Box>
          </Card>

          {/* ⭐ El historial existe porque la operación existe: hasta la F3 de
              Seguridad no había forma de cambiar un precio, así que tampoco
              había nada que historiar. */}
          <Card className="entity-card mt-3">
            <Box className="card-title-row">
              <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>
                Historial de precios
              </Typography>
              <Typography variant="caption" className="text-tertiary">
                quién lo cambió y con qué motivo
              </Typography>
            </Box>

            {history.length === 0 ? (
              <Typography variant="body2" className="text-tertiary">
                Sin cambios de precio en esta sesión. Cambiar un precio es una operación con nombre,
                motivo y grado: se hace desde <strong>Precios y márgenes</strong> y queda registrada.
              </Typography>
            ) : (
              <Box className="pd-history">
                {history.map((h) => (
                  <div className="pd-history__row" key={h.id}>
                    <span className="pd-history__move">
                      {money(h.before)} <em>→</em> <strong>{money(h.after)}</strong>
                    </span>
                    <span className={`pd-history__pct ${h.variation > 0 ? "is-up" : "is-down"}`}>
                      {h.variation > 0 ? "+" : ""}{(h.variation * 100).toFixed(1)} %
                    </span>
                    <span className="pd-history__reason">“{h.reason}”</span>
                    <em className="text-tertiary">{stamp(h.at)}</em>
                  </div>
                ))}
              </Box>
            )}
          </Card>
        </Grid>

        {/* ------------------------------------------------ económico */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Card className="entity-card">
            <Typography variant="h6" className="card-title">Precio y margen</Typography>

            <Box className="pd-price">
              <strong>{money(product.price)}</strong>
              {product.onSale && (
                <Tooltip title={`Precio de comparación tachado en la tienda · ${product.discountPercent} % menos`}>
                  <em>{money(product.compareAtPrice)}</em>
                </Tooltip>
              )}
            </Box>

            <Box className="pd-grid pd-grid--tight">
              <span>Costo</span><div>{money(product.cost)}</div>
              <span>Margen</span>
              <div>
                <StatusBadge
                  tone={margin < 0 ? "danger" : (margin < 0.2 ? "warning" : "success")}
                  label={pct(margin)}
                  showDot={false}
                />
              </div>
            </Box>
          </Card>

          <Card className="entity-card mt-3">
            <Box className="card-title-row">
              <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>Stock</Typography>
              <Button variant="ghost" onClick={() => navigate("/inventario")}>Ver stock →</Button>
            </Box>

            {stockRow ? (
              <>
                <Box className="pd-grid pd-grid--tight">
                  <span>Disponible</span><div><strong>{stockRow.available}</strong> u.</div>
                  <span>Físico</span><div>{stockRow.onHand} u.</div>
                  <span>Reservado</span><div>{stockRow.reserved} u.</div>
                </Box>
                <Typography variant="caption" className="text-tertiary">
                  El stock no es del catálogo: lo administra Inventario por SKU y depósito.
                </Typography>
              </>
            ) : (
              <Typography variant="body2" className="text-tertiary">
                Inventario no administra este SKU: el catálogo muestra su valor de referencia
                ({product.stock} u.).
              </Typography>
            )}
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default ProductoDetalle;
