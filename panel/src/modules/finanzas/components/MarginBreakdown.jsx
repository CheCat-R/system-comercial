import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { Link as RouterLink } from "react-router-dom";

import Modal from "../../../components/Modal/Modal";
import Button from "../../../components/Button/Button";
import StatusBadge from "../../../components/StatusBadge/StatusBadge";
import PnlWaterfall from "./PnlWaterfall";
import { money, percent, formatDate } from "../lib/time";

/**
 * Desglose del margen de UN pedido. Cada línea de la cascada es trazable a su origen
 * (pedido, envío, factura).
 */
const MarginBreakdown = ({ row, onClose }) => {
  if (!row) return null;

  const waterfall = [
    {
      key: "rev",
      label: row.discount
        ? `Ingresos netos (tras −${money(row.discount)} de descuento${row.couponCode ? ` · ${row.couponCode}` : ""})`
        : "Ingresos netos",
      amount: row.revenueNet, kind: "start",
    },
    { key: "cogs", label: "Costo de mercadería (COGS)", amount: -row.cogs, kind: "cost" },
    { key: "gm", label: "Margen bruto", amount: row.grossMargin, pct: row.revenueNet ? row.grossMargin / row.revenueNet : null, kind: "subtotal" },
    { key: "ship", label: `Costo de envío real${row.shippingCost ? "" : " (aún sin despachar)"}`, amount: -row.shippingCost, kind: "cost" },
    { key: "gw", label: `Comisión de pasarela (${row.gatewayLabel})`, amount: -row.gatewayFee, kind: "cost" },
    ...(row.sellerCommission ? [{ key: "seller", label: `Comisión de vendedor (${row.seller})`, amount: -row.sellerCommission, kind: "cost" }] : []),
    { key: "cm", label: "Margen de contribución", amount: row.contributionMargin, pct: row.marginPct, kind: "total" },
  ];

  return (
    <Modal
      open={Boolean(row)}
      onClose={onClose}
      title={`Margen del pedido #${row.orderId}`}
      subtitle={`${row.customerName} · ${row.channel} · ${formatDate(row.date)}`}
      maxWidth="sm"
      actions={<Button variant="ghost" onClick={onClose}>Cerrar</Button>}
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, pt: 1 }}>
        {row.returned && (
          <Box sx={{ p: 1.5, borderRadius: "var(--radius-sm)", background: "var(--warning-bg)", border: "1px solid var(--warning-border)" }}>
            <Typography variant="body2" sx={{ color: "var(--warning-text)" }}>
              Pedido devuelto: el ingreso se revirtió con una Nota de Crédito y la mercadería volvió al
              stock. El flete y la comisión de pasarela ya pagados no se recuperan.
            </Typography>
          </Box>
        )}

        <PnlWaterfall rows={waterfall} />

        <Box sx={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
          <span>Margen de envío (cobrado − real)</span>
          <span className="mono">{money(row.shippingMargin)}</span>
        </Box>

        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", pt: 1, borderTop: "1px solid var(--border-subtle)" }}>
          <RouterLink to={`/pedidos/${row.orderId}`} className="mono">Ver pedido</RouterLink>
          <RouterLink to={`/logistica`} className="mono">Ver envío</RouterLink>
        </Box>

        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <StatusBadge
            tone={row.contributionMargin >= 0 ? "success" : "danger"}
            label={`${row.contributionMargin >= 0 ? "Aporta" : "Resta"} ${money(Math.abs(row.contributionMargin))} · ${percent(row.marginPct)}`}
            showDot={false}
          />
        </Box>
      </Box>
    </Modal>
  );
};

export default MarginBreakdown;
