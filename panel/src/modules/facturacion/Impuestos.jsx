import { useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Switch from "@mui/material/Switch";

import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";
import {
  getVatBook, getAvailableMonths, getIssuer,
  getPointsOfSale, getVatByCategory, getPerceptionRules,
  updateVatCategory, togglePerceptionRule,
} from "./api/billingApi";
import { DOC_TYPES } from "./lib/fiscal";
import { formatDate, money, monthLabel } from "./lib/time";
import "./Impuestos.css";

const RATE_OPTIONS = [0.21, 0.105, 0.27, 0];
const rateLabel = (r) => (r === 0 ? "No gravado" : `${(r * 100).toString().replace(".", ",")} %`);

const Impuestos = () => {
  const { showToast } = useToast();
  const { check } = useAuth();
  const puedeIva = check("facturacion.iva");
  const [tab, setTab] = useState(0);
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  const months = getAvailableMonths();
  const [month, setMonth] = useState(months[0] || "");
  const { rows, totals } = getVatBook({ month: month || undefined });

  const bookColumns = [
    { field: "issueDate", headerName: "Fecha", renderCell: (r) => <span className="nowrap">{formatDate(r.issueDate)}</span> },
    { field: "type", headerName: "Comprobante", renderCell: (r) => <span className="mono">{DOC_TYPES[r.docType]?.short} {r.letter} {r.fullNumber}</span> },
    { field: "customerName", headerName: "Cliente" },
    { field: "customerTaxId", headerName: "CUIT/CUIL", renderCell: (r) => <span className="mono text-tertiary">{r.customerTaxId || "—"}</span> },
    { field: "net21", headerName: "Neto 21%", align: "right", renderCell: (r) => <span className="mono">{money(r.netByRate["0.21"] || 0)}</span> },
    { field: "net0", headerName: "No gravado", align: "right", renderCell: (r) => <span className="mono">{money(r.netByRate["0"] || 0)}</span> },
    { field: "vat21", headerName: "IVA 21%", align: "right", renderCell: (r) => <span className="mono">{money(r.vatByRate["0.21"] || 0)}</span> },
    {
      field: "total", headerName: "Total", align: "right",
      renderCell: (r) => (
        <span className="mono" style={{ fontWeight: 600, color: r.docType === "nota_credito" ? "var(--danger-text)" : "inherit" }}>
          {r.docType === "nota_credito" ? "−" : ""}{money(r.total)}
        </span>
      ),
    },
  ];

  return (
    <Box className="page fade-in">
      <PageHeader title="Impuestos" subtitle="Libro IVA Ventas y configuración impositiva." />

      <Box className="surface" sx={{ overflow: "hidden" }}>
        <Box className="table-tabs">
          <Tabs value={tab} onChange={(_, v) => setTab(v)}>
            <Tab label="Libro IVA Ventas" />
            <Tab label="Configuración" />
          </Tabs>
        </Box>

        {tab === 0 && (
          <Box sx={{ p: 3 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2, flexWrap: "wrap", mb: 2 }}>
              <Select size="small" value={month} onChange={(e) => setMonth(e.target.value)} displayEmpty sx={{ minWidth: 200 }}>
                <MenuItem value="">Todos los períodos</MenuItem>
                {months.map((m) => <MenuItem key={m} value={m} sx={{ textTransform: "capitalize" }}>{monthLabel(m)}</MenuItem>)}
              </Select>
              <Button variant="ghost" startIcon={<FileDownloadOutlinedIcon />} onClick={() => showToast("La exportación del Libro IVA requiere el permiso `exportar` — simulada en esta versión.", "info")}>
                Exportar
              </Button>
            </Box>

            <DataTable columns={bookColumns} data={rows} emptyMessage="Sin comprobantes en este período." />

            <Box className="libro-iva-totales">
              <div><span>Neto gravado 21%</span><strong className="mono">{money(totals.net21)}</strong></div>
              <div><span>No gravado</span><strong className="mono">{money(totals.net0)}</strong></div>
              <div><span>IVA débito 21%</span><strong className="mono">{money(totals.vat21)}</strong></div>
              <div><span>Percepciones</span><strong className="mono">{money(totals.perceptions)}</strong></div>
              <div className="libro-iva-totales__grand"><span>Total del período</span><strong className="mono">{money(totals.total)}</strong></div>
            </Box>
          </Box>
        )}

        {tab === 1 && (
          <Box sx={{ p: 3, display: "flex", flexDirection: "column", gap: 4 }}>
            <Box>
              <Typography variant="h6" className="card-title">Alícuota de IVA por categoría</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Cada SKU puede sobreescribirla con su propio <span className="mono">taxRate</span>.
              </Typography>
              <Box className="tax-config-list">
                {getVatByCategory().map((v) => (
                  <Box key={v.category} className="tax-config-row">
                    <span>{v.category}</span>
                    {/* ⭐ Cambiar una alícuota altera cómo se calcula el impuesto de
                        todo lo que se emita después: es «con aprobación» en el
                        catálogo. El selector se apaga con el motivo a la vista. */}
                    <Select
                      size="small" value={v.rate}
                      disabled={!puedeIva.allowed}
                      title={puedeIva.allowed ? "" : puedeIva.reason}
                      onChange={(e) => { updateVatCategory(v.category, e.target.value); refresh(); showToast(`${v.category}: IVA ${rateLabel(Number(e.target.value))}`, "success"); }}
                      sx={{ minWidth: 140 }}
                    >
                      {RATE_OPTIONS.map((r) => <MenuItem key={r} value={r}>{rateLabel(r)}</MenuItem>)}
                    </Select>
                  </Box>
                ))}
              </Box>
            </Box>

            <Box>
              <Typography variant="h6" className="card-title">Puntos de venta</Typography>
              <Box className="tax-config-list">
                {getPointsOfSale().map((p) => (
                  <Box key={p.id} className="tax-config-row">
                    <span className="mono">{p.id}</span>
                    <span style={{ flex: 1 }}>{p.name}</span>
                    <StatusBadge tone={p.isDefault ? "info" : "neutral"} label={p.isDefault ? "Por defecto" : "Activo"} showDot={false} />
                  </Box>
                ))}
              </Box>
            </Box>

            <Box>
              <Typography variant="h6" className="card-title">Percepciones por jurisdicción (IIBB)</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Configuradas pero <strong>no se aplican automáticamente</strong> todavía — se activan cuando Finanzas cierre el circuito.
              </Typography>
              <Box className="tax-config-list">
                {getPerceptionRules().map((p) => (
                  <Box key={p.jurisdiction} className="tax-config-row">
                    <span style={{ flex: 1 }}>{p.jurisdiction}</span>
                    <span className="mono text-tertiary">{String(+(p.rate * 100).toFixed(2)).replace(".", ",")} %</span>
                    <Switch
                      size="small" checked={p.active}
                      onChange={() => { togglePerceptionRule(p.jurisdiction); refresh(); }}
                    />
                  </Box>
                ))}
              </Box>
            </Box>

            <Box>
              <Typography variant="h6" className="card-title">Datos del emisor</Typography>
              <Box className="tax-config-emisor">
                {(() => {
                  const iss = getIssuer();
                  return (
                    <>
                      <div><span>Razón social</span><strong>{iss.legalName}</strong></div>
                      <div><span>CUIT</span><strong className="mono">{iss.taxId}</strong></div>
                      <div><span>Condición</span><strong>{iss.taxCondition}</strong></div>
                      <div><span>Ingresos Brutos</span><strong className="mono">{iss.grossIncome}</strong></div>
                      <div><span>Inicio de actividades</span><strong>{formatDate(iss.activityStart)}</strong></div>
                      <div><span>Domicilio fiscal</span><strong>{iss.address}</strong></div>
                    </>
                  );
                })()}
              </Box>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default Impuestos;
