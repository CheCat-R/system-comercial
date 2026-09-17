import Box from "@mui/material/Box";

import DataTable from "../../../components/DataTable/DataTable";
import StatusBadge from "../../../components/StatusBadge/StatusBadge";
import { LEDGER_TYPE } from "../lib/loyalty";
import { formatDateTime } from "../lib/time";

const SOURCE_LABEL = { order: "Pedido", redemption: "Canje", campaign: "Campaña", manual: "Manual" };

/** Bitácora de movimientos de puntos (§8.7 · tab Movimientos). `rows` = salida de `getPointsLedger`. */
const PointsLedgerTable = ({ rows, showCustomer = true, emptyMessage = "Sin movimientos de puntos." }) => {
  const columns = [
    ...(showCustomer ? [{ field: "customerName", headerName: "Cuenta" }] : []),
    {
      field: "type", headerName: "Tipo",
      renderCell: (r) => <StatusBadge label={LEDGER_TYPE[r.type]?.label || r.type} tone={LEDGER_TYPE[r.type]?.tone || "neutral"} />,
    },
    {
      field: "points", headerName: "Puntos", align: "right",
      renderCell: (r) => (
        <span className="mono" style={{ color: r.points >= 0 ? "var(--success-text)" : "var(--danger-text)", fontWeight: 600 }}>
          {r.points > 0 ? "+" : ""}{r.points.toLocaleString("es-AR")}
        </span>
      ),
    },
    { field: "balanceAfter", headerName: "Saldo", align: "right", renderCell: (r) => <span className="mono">{r.balanceAfter.toLocaleString("es-AR")}</span> },
    {
      field: "source", headerName: "Origen",
      renderCell: (r) => (
        <span className="text-tertiary">
          {SOURCE_LABEL[r.sourceType] || r.sourceType}{r.sourceId ? ` ${r.sourceType === "order" ? "#" : ""}${r.sourceId}` : ""}
          {r.note ? ` · ${r.note}` : ""}
        </span>
      ),
    },
    { field: "at", headerName: "Fecha", renderCell: (r) => <span className="text-tertiary nowrap">{formatDateTime(r.at)}</span> },
  ];

  return (
    <Box>
      <DataTable columns={columns} data={rows.map((r) => ({ ...r, id: r.id }))} emptyMessage={emptyMessage} />
    </Box>
  );
};

export default PointsLedgerTable;
