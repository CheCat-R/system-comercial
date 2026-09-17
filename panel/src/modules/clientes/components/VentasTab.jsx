import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";

import AddIcon from "@mui/icons-material/Add";

import Button from "../../../components/Button/Button";
import DataTable from "../../../components/DataTable/DataTable";
import StatusBadge from "../../../components/StatusBadge/StatusBadge";
import { useToast } from "../../../components/Toast/ToastContext";
import { getAccountQuotes, getQuotePipeline, convertQuoteToOrder } from "../api/clientsApi";
import { money, formatDate } from "../lib/time";
import "./VentasTab.css";

const STATUS = {
  draft: { label: "Borrador", tone: "neutral" },
  sent: { label: "Enviada", tone: "warning" },
  accepted: { label: "Aceptada", tone: "info" },
  converted: { label: "Convertida", tone: "success" },
  lost: { label: "Perdida", tone: "danger" },
};

const VentasTab = ({ account, onChange }) => {
  const { showToast } = useToast();
  const quotes = getAccountQuotes(account.id);
  const pipeline = getQuotePipeline(account.id);
  const pipelineTotal = pipeline.reduce((s, p) => s + p.amount, 0) || 1;
  const open = pipeline.filter((p) => ["draft", "sent", "accepted"].includes(p.key));
  const openAmount = open.reduce((s, p) => s + p.amount, 0);

  const convert = (quote) => {
    onChange(convertQuoteToOrder(account.id, quote.id));
    showToast(`Cotización ${quote.id} convertida a pedido`, "success");
  };

  const columns = [
    { field: "id", headerName: "Cotización", renderCell: (q) => <span className="mono" style={{ fontWeight: 600 }}>{q.id}</span> },
    { field: "sellerName", headerName: "Vendedor", renderCell: (q) => <span className="text-tertiary nowrap">{q.sellerName}</span> },
    { field: "amount", headerName: "Monto", align: "right", renderCell: (q) => <span style={{ fontWeight: 600 }}>{money(q.amount)}</span> },
    { field: "status", headerName: "Estado", align: "center", renderCell: (q) => <StatusBadge label={STATUS[q.status].label} tone={STATUS[q.status].tone} /> },
    { field: "createdAt", headerName: "Fecha", renderCell: (q) => <span className="text-tertiary nowrap">{formatDate(q.createdAt)}</span> },
    {
      field: "actions", headerName: "", align: "right", width: 150,
      renderCell: (q) =>
        q.status === "sent" || q.status === "accepted" ? (
          <Button variant="primary" size="small" className="nowrap" onClick={() => convert(q)}>
            Convertir a pedido
          </Button>
        ) : q.status === "draft" ? (
          <Button variant="secondary" size="small" onClick={() => showToast("Edición de cotización — módulo Ventas", "info")}>
            Editar
          </Button>
        ) : null,
    },
  ];

  return (
    <Box className="ventas-tab">
      <Card className="entity-card">
        <Box className="card-title-row">
          <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>Pipeline de la cuenta</Typography>
          <Button variant="secondary" size="small" startIcon={<AddIcon />}
            onClick={() => showToast("Nueva cotización — módulo Ventas", "info")}>
            Nueva cotización
          </Button>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          <strong>{money(openAmount)}</strong> en oportunidades abiertas ·{" "}
          {open.reduce((s, p) => s + p.count, 0)} cotización(es)
        </Typography>

        <div className="vpipe">
          {pipeline.filter((p) => p.count > 0).map((p) => (
            <div
              key={p.key}
              className={`vpipe__seg vpipe__seg--${p.key}`}
              style={{ flexGrow: Math.max(p.amount / pipelineTotal, 0.12) }}
              title={`${p.label}: ${p.count} · ${money(p.amount)}`}
            >
              <span className="vpipe__label">{p.label}</span>
              <span className="vpipe__val">{p.count} · {money(p.amount)}</span>
            </div>
          ))}
          {pipeline.every((p) => p.count === 0) && (
            <div className="vpipe__empty">Sin cotizaciones para esta cuenta.</div>
          )}
        </div>
      </Card>

      <Card className="entity-card" sx={{ p: 0 }}>
        <DataTable columns={columns} data={quotes} emptyMessage="Esta cuenta no tiene cotizaciones." />
      </Card>
    </Box>
  );
};

export default VentasTab;
