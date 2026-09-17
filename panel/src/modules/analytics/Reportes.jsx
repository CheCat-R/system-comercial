/**
 * Reportes guardados — consultas con nombre.
 *
 * Cada fila se puede abrir en el Explorador, duplicar o exportar. Los ocho de
 * fábrica no se borran: son la puerta de entrada al módulo para quien todavía no
 * sabe qué preguntarle. Ver docs/MODULO-ANALYTICS.md §9.4.
 */
import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";

import MoreVertIcon from "@mui/icons-material/MoreVert";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";

import { listReports, duplicateReport, deleteReport, runReport } from "./api/analyticsApi";
import { buildCsv, downloadCsv, csvFilename } from "./lib/csv";
import { formatDate } from "../tienda/lib/time";
import "./Analytics.css";

const VIEW_LABEL = { table: "Tabla", bar: "Barras", line: "Línea" };

const Reportes = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();
  const role = user?.role || "";

  const [search, setSearch] = useState("");
  const [anchor, setAnchor] = useState(null);
  const [activeRow, setActiveRow] = useState(null);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => listReports({ search }), [search, version]);

  const openInExplorer = (report) => navigate(`/analytics/explorador?reporte=${report.id}`);

  const handleExport = (report) => {
    const run = runReport(report.id, { role });
    if (!run) return;
    const csv = buildCsv(run.result, { filters: report.query.filters, title: report.name });
    downloadCsv(csv, csvFilename(report.name, run.result.period));
    setAnchor(null);
    showToast("CSV descargado", "success");
  };

  const handleDelete = () => {
    const result = deleteReport(activeRow.id);
    setAnchor(null);
    if (!result.ok) { showToast(result.error, "error"); return; }
    refresh();
    showToast("Reporte eliminado", "success");
  };

  const columns = [
    {
      field: "name", headerName: "Reporte",
      renderCell: (r) => (
        <Box className="an-reportcell">
          <span>
            <strong>
              {r.name}
              {r.system && (
                <Tooltip title="Reporte de fábrica: no se elimina. Duplicalo para editarlo.">
                  <LockOutlinedIcon sx={{ fontSize: 12, ml: 0.5, verticalAlign: "-1px", color: "var(--text-tertiary)" }} />
                </Tooltip>
              )}
            </strong>
            <em>{r.description}</em>
          </span>
        </Box>
      ),
    },
    {
      field: "metrics", headerName: "Métricas",
      renderCell: (r) => (
        <Box className="an-reportcell__chips">
          {r.metricLabels.slice(0, 2).map((l) => <span className="an-chip" key={l}>{l}</span>)}
          {r.metricLabels.length > 2 && <span className="an-chip">+{r.metricLabels.length - 2}</span>}
        </Box>
      ),
    },
    {
      field: "dimensionLabel", headerName: "Cortado por",
      renderCell: (r) => <span className="text-tertiary">{r.dimensionLabel}</span>,
    },
    {
      field: "periodLabel", headerName: "Período",
      renderCell: (r) => (
        <span className="text-tertiary nowrap">
          {r.periodLabel}
          {r.filterCount > 0 && <em className="an-reportcell__filters"> · {r.filterCount} filtro(s)</em>}
        </span>
      ),
    },
    {
      field: "view", headerName: "Vista", align: "center",
      renderCell: (r) => <StatusBadge tone="neutral" label={VIEW_LABEL[r.view] || r.view} showDot={false} />,
    },
    {
      field: "createdAt", headerName: "Creado",
      renderCell: (r) => <span className="text-tertiary nowrap">{formatDate(r.createdAt)} · {r.createdBy}</span>,
    },
    {
      field: "actions", headerName: "", align: "right", width: 48,
      renderCell: (r) => (
        <IconButton
          size="small" aria-label="acciones"
          onClick={(e) => { e.stopPropagation(); setAnchor(e.currentTarget); setActiveRow(r); }}
        >
          <MoreVertIcon fontSize="small" />
        </IconButton>
      ),
    },
  ];

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Reportes"
        subtitle="Consultas guardadas. Un reporte es una consulta con nombre y una forma de mostrarse."
        actions={
          <Button variant="primary" startIcon={<ScienceOutlinedIcon />} onClick={() => navigate("/analytics/explorador")}>
            Nueva consulta
          </Button>
        }
      />

      <Box className="table-tabs">
        <Box sx={{ flex: 1 }} />
        <TextField
          size="small" placeholder="Buscar reporte…"
          value={search} onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 260 }}
        />
      </Box>

      <DataTable
        columns={columns} data={rows}
        onRowClick={openInExplorer}
        emptyMessage="No hay reportes con esa búsqueda."
      />

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => { openInExplorer(activeRow); setAnchor(null); }}>Abrir en el Explorador</MenuItem>
        <MenuItem onClick={() => handleExport(activeRow)}>Exportar CSV</MenuItem>
        <MenuItem onClick={() => { duplicateReport(activeRow.id); setAnchor(null); refresh(); showToast("Reporte duplicado", "success"); }}>
          Duplicar
        </MenuItem>
        <MenuItem disabled={activeRow?.system} onClick={handleDelete}>Eliminar</MenuItem>
      </Menu>
    </Box>
  );
};

export default Reportes;
