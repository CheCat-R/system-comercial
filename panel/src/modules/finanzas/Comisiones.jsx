import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";

import CreditCardOutlinedIcon from "@mui/icons-material/CreditCardOutlined";
import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import PaidOutlinedIcon from "@mui/icons-material/PaidOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Permitido from "../seguridad/components/Permitido";
import Button from "../../components/Button/Button";
import StatCard from "../../components/Cards/StatCard/StatCard";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useToast } from "../../components/Toast/ToastContext";
import CommissionRateTable from "./components/CommissionRateTable";
import {
  listCommissions, getCommissionsSummary, getPendingSettlements, listSettlements, settleCommissions,
} from "./api/financeApi";
import { COMMISSION_KIND, COMMISSION_STATUS } from "./lib/finance";
import { money, percent, formatDate } from "./lib/time";

const Comisiones = () => {
  const { showToast } = useToast();
  const [tab, setTab] = useState(0);
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  const summary = getCommissionsSummary();
  const devengadas = listCommissions().map((c) => ({ ...c, id: c.id }));
  const pending = getPendingSettlements();
  const settlements = listSettlements();

  const kpis = [
    { title: "Comisión de pasarela", value: money(summary.pasarelaTotal), icon: <CreditCardOutlinedIcon /> },
    { title: "Devengado a vendedores", value: money(summary.devengadoVendedores), icon: <GroupOutlinedIcon /> },
    { title: "Pendiente de liquidar", value: money(summary.pendienteLiquidar), icon: <PaidOutlinedIcon /> },
  ];

  const devengadasColumns = [
    { field: "kind", headerName: "Tipo", renderCell: (r) => <StatusBadge {...COMMISSION_KIND[r.kind]} showDot={false} /> },
    { field: "origen", headerName: "Origen", renderCell: (r) => (
      <Box sx={{ display: "flex", flexDirection: "column" }}>
        <RouterLink to={`/pedidos/${r.orderId}`} className="mono">Pedido #{r.orderId}</RouterLink>
        <span className="text-tertiary" style={{ fontSize: "var(--text-xs)" }}>{r.customerName}</span>
      </Box>
    ) },
    { field: "rateLabel", headerName: "Detalle", renderCell: (r) => <span className="text-tertiary">{r.rateLabel}</span> },
    { field: "base", headerName: "Base", align: "right", renderCell: (r) => <span className="mono text-tertiary">{money(r.base)}</span> },
    { field: "rate", headerName: "Tasa", align: "right", renderCell: (r) => <span className="mono">{percent(r.rate)}</span> },
    { field: "amount", headerName: "Monto", align: "right", renderCell: (r) => <span className="mono" style={{ fontWeight: 600 }}>{money(r.amount)}</span> },
    { field: "status", headerName: "Estado", align: "center", renderCell: (r) => <StatusBadge {...COMMISSION_STATUS[r.status]} /> },
  ];

  return (
    <Box className="page fade-in">
      <PageHeader title="Comisiones" subtitle="Fee de pasarela por cada cobro y comisión de la fuerza de venta B2B." />

      <Grid container spacing={2.5}>
        {kpis.map((k) => <Grid key={k.title} size={{ xs: 12, sm: 4 }}><StatCard {...k} /></Grid>)}
      </Grid>

      <Box className="surface" sx={{ overflow: "hidden" }}>
        <Box className="table-tabs">
          <Tabs value={tab} onChange={(_, v) => setTab(v)}>
            <Tab label="Devengadas" />
            <Tab label="Liquidaciones" />
            <Tab label="Tarifas" />
          </Tabs>
        </Box>

        {tab === 0 && (
          <DataTable columns={devengadasColumns} data={devengadas} emptyMessage="Sin comisiones devengadas." />
        )}

        {tab === 1 && (
          <Box sx={{ p: 3, display: "flex", flexDirection: "column", gap: 3 }}>
            <Box>
              <Typography variant="h6" className="card-title">Pendiente de liquidar</Typography>
              {pending.length === 0 && <Typography variant="body2" color="text.secondary">No hay comisiones de vendedor pendientes.</Typography>}
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                {pending.map((g) => (
                  <Card key={g.sellerId} className="entity-card" sx={{ p: 2.5, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
                    <Box>
                      <Typography variant="body2" fontWeight={600}>{g.label}</Typography>
                      <Typography variant="caption" color="text.secondary">{g.count} comisión(es) · {money(g.amount)}</Typography>
                    </Box>
                    <Permitido permiso="finanzas.liquidar">
                      <Button variant="primary" onClick={() => { settleCommissions(g.sellerId); refresh(); showToast(`Liquidación de ${g.label} generada`, "success"); }}>
                        Liquidar {money(g.amount)}
                      </Button>
                    </Permitido>
                  </Card>
                ))}
              </Box>
            </Box>

            {settlements.length > 0 && (
              <Box>
                <Typography variant="h6" className="card-title">Liquidaciones registradas</Typography>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {settlements.map((s) => (
                    <Box key={s.id} sx={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)", color: "var(--text-secondary)", py: 0.5 }}>
                      <span><span className="mono">{s.id}</span> · {s.label} · {s.count} comisión(es) · {formatDate(s.settledAt)}</span>
                      <span className="mono">{money(s.amount)}</span>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        )}

        {tab === 2 && (
          <Box sx={{ p: 3 }}>
            <CommissionRateTable onChange={refresh} />
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default Comisiones;
