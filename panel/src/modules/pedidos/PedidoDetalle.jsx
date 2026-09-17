import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import Avatar from "@mui/material/Avatar";
import Tooltip from "@mui/material/Tooltip";

import TextField from "@mui/material/TextField";

import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import ReceiptIcon from "@mui/icons-material/Receipt";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import UndoOutlinedIcon from "@mui/icons-material/UndoOutlined";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import LocalOfferOutlinedIcon from "@mui/icons-material/LocalOfferOutlined";
import RedeemOutlinedIcon from "@mui/icons-material/RedeemOutlined";

import Button from "../../components/Button/Button";
import EntityHeader from "../../components/EntityHeader/EntityHeader";
import { useEntityLabel } from "../../components/Breadcrumbs/EntityLabelContext";
import Permitido from "../seguridad/components/Permitido";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useToast } from "../../components/Toast/ToastContext";
import { getOrder, confirmPayment, rejectPayment, retryPayment, cancelOrder, refundOrder, applyDiscountToOrder, clearOrderDiscount } from "./api/pedidosApi";
import { getShipmentForOrder } from "../logistica/api/logisticaApi";
// ⭐ El rastro se lee **dentro de la entidad**: uno que obliga a irse del pedido
// para saber quién lo canceló no se usa nunca (MODULO-SEGURIDAD.md §2.8).
import ChangeLog from "../seguridad/components/ChangeLog";
import ReasonDialog from "../seguridad/components/ReasonDialog";
import { getInvoiceForOrder } from "../facturacion/api/billingApi";
import { quoteDiscount, quoteRedemption } from "../marketing/api/marketingApi";
import { formatDateTime, money } from "./lib/time";
import "./PedidoDetalle.css";

const PedidoDetalle = () => {
  const { id } = useParams();
  const { setLabel } = useEntityLabel();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [, setTick] = useState(0);
  const [couponInput, setCouponInput] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelError, setCancelError] = useState(null);

  const order = getOrder(id);

  // ⭐ La miga de pan dice el nombre de la cosa, no la palabra «Detalle»: la
  // pantalla ya tiene la entidad cargada, sólo hace falta que lo cuente.
  useEffect(() => { if (order) setLabel(order.id, `#${order.id}`); }, [order, setLabel]);

  if (!order) {
    return (
      <Box className="page fade-in">
        <Typography>No se encontró el pedido #{id}.</Typography>
        <Button variant="ghost" onClick={() => navigate("/pedidos")}>Volver</Button>
      </Box>
    );
  }

  const refresh = () => setTick((t) => t + 1);

  const handleConfirmPayment = () => {
    try {
      const { backorders } = confirmPayment(order.id);
      refresh();
      if (backorders.length > 0) {
        const names = backorders.map((b) => getOrder(order.id).items.find((it) => it.skuId === b.skuId)?.name || b.skuId);
        showToast(`Pago confirmado, pero faltan ${backorders.reduce((s, b) => s + b.missing, 0)} unidades de ${names.join(", ")} — quedó en backorder`, "warning");
      } else {
        showToast("Pago confirmado — stock reservado", "success");
      }
    } catch (err) {
      showToast(err.message, "warning");
    }
  };

  // ⭐ El motivo se pide **antes**: la cancelación no ocurre hasta que alguien
  // escribe por qué. Un motivo pedido después es una encuesta
  // (MODULO-SEGURIDAD.md §2.10).
  const handleCancel = (reason) => {
    try {
      cancelOrder(order.id, { reason });
      setCancelOpen(false);
      setCancelError(null);
      refresh();
      showToast("Pedido cancelado", "info");
    } catch (err) {
      setCancelError(err.message);
    }
  };

  // El rechazo de pago existe desde el módulo de Automatizaciones
  // (docs/MODULO-AUTOMATIZACIONES.md §3.8.1): sin este estado, "pago rechazado"
  // no se podía disparar. No hay reserva que liberar — se reserva recién al
  // confirmar el pago.
  const handleRejectPayment = () => {
    try {
      rejectPayment(order.id);
      refresh();
      showToast("Pago rechazado — se emitió el evento a Automatizaciones", "warning");
    } catch (err) {
      showToast(err.message, "warning");
    }
  };

  const handleRetryPayment = () => {
    try {
      retryPayment(order.id);
      refresh();
      showToast("El pedido volvió a quedar pendiente de pago", "info");
    } catch (err) {
      showToast(err.message, "warning");
    }
  };

  const handleGoToShipment = () => {
    const shipment = getShipmentForOrder(order.id);
    navigate(`/logistica/${shipment.id}`);
  };

  const handleApplyDiscount = () => {
    const items = order.items.map((it) => ({ skuId: it.skuId, qty: it.qty, unitPrice: it.unitPrice }));
    const q = quoteDiscount({ items, customerName: order.customerName, couponCode: couponInput.trim() || undefined });
    if (q.error) { showToast(q.error, "warning"); return; }
    if (!q.discount && !q.appliedPromotions.length && !q.freeShipping) {
      showToast("No hay promoción ni cupón aplicable a este pedido", "info");
      return;
    }
    applyDiscountToOrder(order.id, q);
    setCouponInput("");
    refresh();
    showToast(q.couponCode ? `Cupón ${q.couponCode} aplicado` : "Promoción aplicada", "success");
  };

  /**
   * ⭐ Quitar el descuento es reversible mientras el pedido siga pendiente: el
   * cupón se vuelve a aplicar con los mismos datos. Se ofrece deshacer.
   */
  const handleClearDiscount = () => {
    const anterior = {
      discount: order.discount,
      couponCode: order.couponCode,
      appliedPromotions: order.appliedPromotions,
      pointsRedeemed: order.pointsRedeemed,
      shipping: order.shipping,
    };
    clearOrderDiscount(order.id);
    refresh();
    showToast("Descuento quitado", "info", {
      action: {
        label: "Deshacer",
        onClick: () => { applyDiscountToOrder(order.id, anterior); refresh(); },
      },
    });
  };

  const redemption = order.paymentStatus === "Pendiente" ? quoteRedemption(order.customerName) : null;

  const handleRedeemPoints = () => {
    const q = quoteRedemption(order.customerName);
    if (!q.points) { showToast(`El cliente tiene ${q.available} puntos (mínimo ${q.minRedeem}).`, "info"); return; }
    applyDiscountToOrder(order.id, { discount: q.value, couponCode: "PUNTOS", appliedPromotions: [], pointsRedeemed: q.points });
    refresh();
    showToast(`${q.points} puntos canjeados · ${money(q.value)}`, "success");
  };

  const invoice = getInvoiceForOrder(order.id);

  const handleRefund = () => {
    try {
      const wasDispatched = order.fulfillmentStatus !== "Sin despachar";
      refundOrder(order.id);
      refresh();
      showToast(wasDispatched ? "Reembolso registrado — mercadería repuesta al stock" : "Reembolso registrado — reserva liberada", "success");
    } catch (err) {
      showToast(err.message, "warning");
    }
  };

  const renderActions = () => {
    if (order.paymentStatus === "Pendiente") {
      return (
        <>
          <Permitido permiso="pedidos.cancelar">
            <Button variant="ghost" onClick={() => setCancelOpen(true)}>Cancelar pedido</Button>
          </Permitido>
          <Button variant="danger" onClick={handleRejectPayment}>Rechazar pago</Button>
          <Button variant="primary" onClick={handleConfirmPayment}>Confirmar pago</Button>
        </>
      );
    }
    if (order.paymentStatus === "Rechazado") {
      return (
        <>
          <Permitido permiso="pedidos.cancelar">
            <Button variant="ghost" onClick={() => setCancelOpen(true)}>Cancelar pedido</Button>
          </Permitido>
          <Button variant="primary" onClick={handleRetryPayment}>Reintentar pago</Button>
        </>
      );
    }
    if (order.paymentStatus === "Pagado") {
      return (
        <>
          {order.fulfillmentStatus === "Sin despachar" && <Button variant="ghost" onClick={handleRefund}>Reembolsar</Button>}
          <Button variant="primary" onClick={handleGoToShipment}>Ver envío</Button>
        </>
      );
    }
    return null;
  };

  const timeline = [
    order.createdAt && { at: order.createdAt, label: "Pedido creado", who: "Cliente", tone: "neutral", icon: <RadioButtonUncheckedIcon sx={{ fontSize: 15 }} /> },
    order.paidAt && { at: order.paidAt, label: "Pago confirmado — stock reservado", who: "Sistema", tone: "success", icon: <CheckCircleIcon sx={{ fontSize: 15 }} /> },
    order.dispatchedAt && { at: order.dispatchedAt, label: "Pedido despachado — stock descontado", who: "Sistema", tone: "accent", icon: <LocalShippingIcon sx={{ fontSize: 15 }} /> },
    order.deliveredAt && { at: order.deliveredAt, label: "Pedido entregado", who: "Sistema", tone: "success", icon: <CheckCircleIcon sx={{ fontSize: 15 }} /> },
    order.returnedAt && {
      at: order.returnedAt,
      label: "Devolución registrada — mercadería repuesta al stock",
      who: "Logística", tone: "neutral", icon: <UndoOutlinedIcon sx={{ fontSize: 15 }} />,
    },
    order.paymentStatus === "Reembolso pendiente" && {
      at: order.returnedAt || order.deliveredAt,
      label: "Reembolso pendiente de aprobación de Finanzas",
      who: "Finanzas", tone: "neutral", icon: <UndoOutlinedIcon sx={{ fontSize: 15 }} />,
    },
    order.refundedAt && {
      at: order.refundedAt,
      label: order.fulfillmentStatus === "Devuelto" ? "Reembolso aprobado y ejecutado" : "Reembolso procesado — reserva liberada",
      who: "Finanzas", tone: "neutral", icon: <UndoOutlinedIcon sx={{ fontSize: 15 }} />,
    },
    order.paymentStatus === "Cancelado" && { at: order.createdAt, label: "Pedido cancelado", who: "Sistema", tone: "danger", icon: <CancelOutlinedIcon sx={{ fontSize: 15 }} /> },
  ].filter(Boolean).sort((a, b) => new Date(b.at) - new Date(a.at));

  const backorderNames = order.backorders?.map((b) => {
    const item = order.items.find((it) => it.skuId === b.skuId);
    return `${item?.name || b.skuId} (faltan ${b.missing})`;
  }) || [];

  return (
    <Box className="page fade-in">
      <EntityHeader
        title={`Pedido #${order.id}`}
        subtitle={`${formatDateTime(order.createdAt)} · ${order.warehouseName}`}
        badges={(
          <>
            <StatusBadge status={order.paymentStatus} />
            <StatusBadge status={order.fulfillmentStatus} />
          </>
        )}
        onBack={() => navigate("/pedidos")}
        backLabel="Volver a pedidos"
        actions={renderActions()}
      />

      {backorderNames.length > 0 && (
        <Box className="pedido-backorder">
          <WarningAmberOutlinedIcon />
          <Box>
            <Typography variant="body2" fontWeight={600}>Este pedido tiene stock pendiente (backorder)</Typography>
            <Typography variant="body2">{backorderNames.join(" · ")}</Typography>
          </Box>
        </Box>
      )}

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Card className="entity-card">
            <Typography variant="h6" className="card-title">Productos</Typography>
            <Box className="order-items-list">
              {order.items.map((it) => {
                const backorder = order.backorders?.find((b) => b.skuId === it.skuId);
                return (
                  <Box key={it.skuId} className="order-item">
                    <Box className="item-details">
                      <Avatar variant="rounded" className="item-thumb">{it.name.charAt(0)}</Avatar>
                      <Box>
                        <Typography variant="body2" fontWeight={600}>{it.name}</Typography>
                        <Typography variant="caption" color="text.secondary" className="mono">{it.sku}</Typography>
                        {backorder && <span className="pedido-line-flag">Backorder: faltan {backorder.missing}</span>}
                      </Box>
                    </Box>
                    <Typography variant="body2" color="text.secondary">{money(it.unitPrice)} x {it.qty}</Typography>
                    <Typography variant="body2" fontWeight={600}>{money(it.lineTotal)}</Typography>
                  </Box>
                );
              })}
            </Box>

            <Divider sx={{ my: 2 }} />

            <Box className="order-summary">
              <Box className="summary-row"><span>Subtotal</span><span>{money(order.subtotal)}</span></Box>
              {order.discount > 0 && (
                <Box className="summary-row" sx={{ color: "var(--success-text)" }}>
                  <span>Descuento{order.couponCode ? ` · ${order.couponCode}` : ""}</span>
                  <span>− {money(order.discount)}</span>
                </Box>
              )}
              <Box className="summary-row"><span>Envío {order.shipping === 0 ? "(gratis)" : "(Standard)"}</span><span>{money(order.shipping)}</span></Box>
              <Box className="summary-row"><span>Impuestos</span><span>{money(order.tax)}</span></Box>
              <Divider sx={{ my: 1 }} />
              <Box className="summary-row summary-row--total"><span>Total</span><span>{money(order.total)}</span></Box>
            </Box>

            {order.paymentStatus === "Pendiente" && (
              <Box sx={{ mt: 2, pt: 2, borderTop: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: 1.5 }}>
                {order.couponCode !== "PUNTOS" && (
                  <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
                    <LocalOfferOutlinedIcon fontSize="small" sx={{ color: "var(--text-tertiary)" }} />
                    <TextField
                      size="small" placeholder="Código de cupón (opcional)" value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                      sx={{ maxWidth: 220 }}
                    />
                    <Button variant="secondary" size="small" onClick={handleApplyDiscount}>
                      {couponInput.trim() ? "Aplicar cupón" : "Buscar promociones"}
                    </Button>
                    {order.discount > 0 && <Button variant="ghost" size="small" onClick={handleClearDiscount}>Quitar</Button>}
                  </Box>
                )}
                {redemption?.available > 0 && order.discount === 0 && (
                  <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap", fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
                    <RedeemOutlinedIcon fontSize="small" sx={{ color: "var(--text-tertiary)" }} />
                    <span>{order.customerName} tiene <strong>{redemption.available.toLocaleString("es-AR")}</strong> puntos</span>
                    <Button variant="secondary" size="small" disabled={!redemption.points} onClick={handleRedeemPoints}>
                      {redemption.points ? `Canjear ${redemption.points.toLocaleString("es-AR")} pts · ${money(redemption.value)}` : `Mínimo ${redemption.minRedeem} pts`}
                    </Button>
                  </Box>
                )}
                {order.couponCode === "PUNTOS" && (
                  <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
                    <RedeemOutlinedIcon fontSize="small" sx={{ color: "var(--success-text)" }} />
                    <span>{order.pointsRedeemed.toLocaleString("es-AR")} puntos canjeados</span>
                    <Button variant="ghost" size="small" onClick={handleClearDiscount}>Quitar</Button>
                  </Box>
                )}
              </Box>
            )}
          </Card>

          <Card className="entity-card mt-3">
            <Box className="card-title-row">
              <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>Pagos</Typography>
              <span className={order.paymentStatus === "Pagado" ? "text-success" : order.paymentStatus === "Reembolsado" ? "text-danger" : "text-secondary"}>
                {order.paymentStatus === "Pagado" ? "Completado" : order.paymentStatus}
              </span>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <ReceiptIcon sx={{ color: "var(--text-tertiary)" }} />
              <Box>
                <Typography variant="body2">{order.paymentMethod}</Typography>
                {order.paymentRef && <Typography variant="caption" color="text.secondary">Transacción: #{order.paymentRef}</Typography>}
              </Box>
            </Box>
          </Card>

          <Card className="entity-card mt-3">
            <Box className="card-title-row">
              <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>Facturación</Typography>
              {invoice && <span className="mono text-secondary">{invoice.letter} {invoice.fullNumber}</span>}
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <ReceiptIcon sx={{ color: "var(--text-tertiary)" }} />
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2">
                  {invoice ? `Factura ${invoice.letter} · ${money(invoice.total)}` : "Todavía sin factura"}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {invoice
                    ? "La factura se emitió automáticamente al confirmarse el pago."
                    : "La factura se emite apenas se confirme el pago."}
                </Typography>
              </Box>
              {invoice && (
                <Button variant="ghost" size="small" onClick={() => navigate(`/facturacion/${invoice.id}`)}>Ver factura</Button>
              )}
            </Box>
          </Card>

          <Card className="entity-card mt-3">
            <Box className="card-title-row">
              <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>Logística</Typography>
              <StatusBadge status={order.fulfillmentStatus} />
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <LocalShippingIcon sx={{ color: "var(--text-tertiary)" }} />
              <Box>
                <Typography variant="body2">Envío a domicilio ({order.shippingCarrier})</Typography>
                <Typography variant="caption" color="text.secondary">
                  {order.paymentStatus === "Pagado"
                    ? "La preparación, el despacho y el seguimiento se gestionan desde Logística."
                    : "El envío se crea apenas se confirme el pago."}
                  {order.fulfillmentStatus === "Devuelto" && " Devuelto por el cliente."}
                  {order.fulfillmentStatus === "Cancelado" && " El pedido se canceló antes de despachar."}
                </Typography>
              </Box>
            </Box>
          </Card>

          <Card className="entity-card mt-3">
            <Typography variant="h6" className="card-title">Timeline del pedido</Typography>
            <Box className="order-timeline">
              {timeline.map((ev, i) => (
                <Box key={i} className={`timeline-item ${i === timeline.length - 1 ? "timeline-item--last" : ""}`}>
                  <span className={`timeline-dot timeline-dot--${ev.tone}`}>{ev.icon}</span>
                  <Box className="timeline-content">
                    <Typography variant="body2" fontWeight={600}>{ev.label}</Typography>
                    <Typography variant="caption" color="text.secondary">{formatDateTime(ev.at)} · {ev.who}</Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Card className="entity-card">
            <Typography variant="h6" className="card-title">Cliente</Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
              <Avatar sx={{ bgcolor: "var(--accent-subtle-bg)", color: "var(--accent-text)", fontWeight: 700 }}>
                {order.customerName.charAt(0)}
              </Avatar>
              <Box>
                <Typography variant="body2" fontWeight={600}>{order.customerName}</Typography>
                <Typography variant="caption" color="text.secondary">{order.customerEmail}</Typography>
              </Box>
            </Box>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Dirección de envío</Typography>
            <Typography variant="body2" color="text.secondary">{order.address}</Typography>
          </Card>

          <Box className="mt-3">
            <ChangeLog subjectType="order" subjectId={order.id} limit={5} />
          </Box>

          <Card className="entity-card mt-3">
            <Typography variant="h6" className="card-title">Notas internas</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
              Sin notas. Solo visible para el equipo.
            </Typography>
            {/* Las notas internas del pedido no existen como dato: `pedidosApi`
                no las guarda. Las notas de una CUENTA sí existen y viven en el
                CRM (`clientsApi.addActivity`). */}
            <Tooltip title="Las notas internas del pedido todavía no existen como dato. Las notas de la cuenta sí: se cargan desde la ficha del cliente en el CRM.">
              <span>
                <Button variant="ghost" size="small" sx={{ mt: 1 }} disabled>Añadir nota</Button>
              </span>
            </Tooltip>
          </Card>
        </Grid>
      </Grid>

      <ReasonDialog
        open={cancelOpen}
        action="pedidos.cancelar"
        title={`Cancelar el pedido #${order.id}`}
        preview={`${order.customerName} · ${money(order.total)} · libera el stock reservado y cierra el pedido`}
        confirmLabel="Cancelar el pedido"
        error={cancelError}
        onClose={() => { setCancelOpen(false); setCancelError(null); }}
        onConfirm={handleCancel}
      />
    </Box>
  );
};

export default PedidoDetalle;
