import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import Avatar from "@mui/material/Avatar";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import IconButton from "@mui/material/IconButton";

import SearchIcon from "@mui/icons-material/Search";
import GetAppIcon from "@mui/icons-material/GetApp";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import StarBorderOutlinedIcon from "@mui/icons-material/StarBorderOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import TrendingDownOutlinedIcon from "@mui/icons-material/TrendingDownOutlined";
import BookmarkBorderOutlinedIcon from "@mui/icons-material/BookmarkBorderOutlined";
import CampaignOutlinedIcon from "@mui/icons-material/CampaignOutlined";
import CloseIcon from "@mui/icons-material/Close";

import PageHeader from "../../components/PageHeader/PageHeader";
import Permitido from "../seguridad/components/Permitido";
import Button from "../../components/Button/Button";
import StatCard from "../../components/Cards/StatCard/StatCard";
import DataTable from "../../components/DataTable/DataTable";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import { SegmentBadge } from "./components/SegmentBadge";
import {
  listAccounts, getPortfolioSummary, getTagColor,
  getSavedViews, saveView, deleteView, sendToCampaign,
} from "./api/clientsApi";
import { money, relativeFromToday } from "./lib/time";
import "./Clientes.css";

const VIEWS = [
  { key: "all", label: "Todos", match: () => true },
  { key: "vip", label: "VIP", match: (m) => m.tier === "vip" },
  { key: "frecuentes", label: "Frecuentes", match: (m) => m.segmentKey === "leal" },
  { key: "riesgo", label: "En riesgo", match: (m) => m.segmentKey === "en_riesgo" },
  { key: "durmientes", label: "Durmientes", match: (m) => ["durmiente", "perdido"].includes(m.segmentKey) },
  { key: "leads", label: "Leads", match: (m) => m.segmentKey === "lead" },
];

const Clientes = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [view, setView] = useState(0);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);

  const [views, setViews] = useState(getSavedViews);
  const [viewsAnchor, setViewsAnchor] = useState(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [campaignName, setCampaignName] = useState("");

  const all = useMemo(() => listAccounts(), []);
  const summary = useMemo(() => getPortfolioSummary(), []);

  const applyView = (v) => {
    const idx = VIEWS.findIndex((x) => x.key === v.filters.view);
    setView(idx >= 0 ? idx : 0);
    setSearch(v.filters.search || "");
    setViewsAnchor(null);
  };

  const handleSaveView = () => {
    if (!viewName.trim()) return showToast("Poné un nombre a la vista", "warning");
    setViews(saveView({ name: viewName, filters: { view: VIEWS[view].key, search } }));
    setSaveOpen(false);
    setViewName("");
    showToast("Vista guardada", "success");
  };

  const removeView = (id, e) => {
    e.stopPropagation();
    setViews(deleteView(id));
  };

  const handleSendCampaign = () => {
    if (!campaignName.trim()) return showToast("Poné un nombre a la campaña", "warning");
    const res = sendToCampaign({ audienceName: campaignName.trim(), accountIds: selected });
    setCampaignOpen(false);
    setCampaignName("");
    setSelected([]);
    showToast(`Audiencia «${res.audienceName}» (${res.count} cuentas) enviada a Marketing`, "success");
  };

  const data = useMemo(() => {
    const matcher = VIEWS[view].match;
    const q = search.toLowerCase();
    return all.filter((a) => {
      if (!matcher(a.metrics)) return false;
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        (a.legalName || "").toLowerCase().includes(q)
      );
    });
  }, [all, view, search]);

  /**
   * ⭐ Exportar clientes es una acción **con permiso propio** en el catálogo
   * (`clientes.exportar`, grado «con motivo»): sacar datos personales del panel
   * es justamente lo que hay que poder ver después. El botón está envuelto en
   * <Permitido>, así que quien no lo tiene lo ve apagado con el motivo.
   */
  const handleExport = () => {
    const cell = (v) => {
      const t = String(v ?? "");
      return /[",;\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const rows = [
      ["Cuenta", "Razón social", "Email", "Tipo", "Segmento", "Tier", "LTV", "Pedidos", "Última compra"],
      ...data.map((a) => [
        a.name, a.legalName || "", a.email, a.type === "company" ? "Empresa" : "Persona",
        a.metrics?.segmentLabel || a.metrics?.segmentKey || "",
        a.metrics?.tier || "", a.metrics?.ltv ?? "", a.metrics?.orders ?? "",
        a.metrics?.lastOrderDate || "",
      ]),
    ];
    const csv = rows.map((r) => r.map(cell).join(";")).join("\n");
    const blob = new Blob([String.fromCharCode(0xFEFF) + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clientes-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`${data.length} cuenta(s) exportada(s)`, "success");
  };

  const kpis = [
    { title: "Total clientes", value: String(summary.total), icon: <GroupsOutlinedIcon /> },
    { title: "Clientes VIP", value: String(summary.vip), icon: <StarBorderOutlinedIcon /> },
    { title: "LTV promedio", value: money(summary.avgLtv), icon: <PaymentsOutlinedIcon /> },
    { title: "En riesgo o inactivos", value: String(summary.atRisk), icon: <TrendingDownOutlinedIcon /> },
  ];

  const columns = [
    {
      field: "name",
      headerName: "Cliente",
      width: "30%",
      renderCell: (a) => (
        <Box className="cliente-cell">
          <Avatar
            className="cliente-cell__avatar"
            variant={a.type === "company" ? "rounded" : "circular"}
          >
            {a.type === "company" ? <BusinessOutlinedIcon sx={{ fontSize: 18 }} /> : a.name.charAt(0)}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography className="cliente-cell__name">{a.name}</Typography>
            <Typography className="cliente-cell__email">{a.email}</Typography>
          </Box>
        </Box>
      ),
    },
    {
      field: "segment",
      headerName: "Segmento",
      align: "center",
      renderCell: (a) => <SegmentBadge segmentKey={a.metrics.segmentKey} />,
    },
    {
      field: "ltv",
      headerName: "LTV",
      align: "right",
      renderCell: (a) => <span className="cliente-cell__ltv">{a.metrics.ltv > 0 ? money(a.metrics.ltv) : "—"}</span>,
    },
    {
      field: "orders",
      headerName: "Pedidos",
      align: "right",
      renderCell: (a) => a.metrics.ordersCount,
    },
    {
      field: "recency",
      headerName: "Última compra",
      renderCell: (a) => (
        <span className={`nowrap ${a.metrics.recencyDays > 90 ? "text-danger" : "text-tertiary"}`}>
          {a.metrics.ordersCount ? relativeFromToday(a.metrics.lastOrderAt) : "Nunca"}
        </span>
      ),
    },
    {
      field: "tags",
      headerName: "Etiquetas",
      renderCell: (a) => (
        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
          {(a.tags || []).map((t) => <span key={t} className={`tag-chip tag-chip--${getTagColor(t)}`}>{t}</span>)}
        </Box>
      ),
    },
  ];

  const toolbar = (
    <>
      <Box className="table-tabs">
        <Tabs value={view} onChange={(_, v) => setView(v)} variant="scrollable" scrollButtons={false}>
          {VIEWS.map((v) => <Tab key={v.key} label={v.label} />)}
        </Tabs>
      </Box>
      <Box className="table-toolbar">
        <TextField
          size="small"
          placeholder="Buscar por nombre, email o razón social…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="table-toolbar__search"
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
              ),
            },
          }}
        />
        <Button
          variant="secondary"
          startIcon={<BookmarkBorderOutlinedIcon />}
          onClick={(e) => setViewsAnchor(e.currentTarget)}
        >
          Vistas{views.length ? ` (${views.length})` : ""}
        </Button>
        <Menu anchorEl={viewsAnchor} open={Boolean(viewsAnchor)} onClose={() => setViewsAnchor(null)}>
          {views.length === 0 && (
            <MenuItem disabled>Todavía no guardaste vistas</MenuItem>
          )}
          {views.map((v) => (
            <MenuItem key={v.id} onClick={() => applyView(v)} className="cli-view-item">
              <span>{v.name}</span>
              <IconButton size="small" onClick={(e) => removeView(v.id, e)} aria-label={`Eliminar ${v.name}`}>
                <CloseIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </MenuItem>
          ))}
          <MenuItem
            divider
            onClick={() => { setViewsAnchor(null); setSaveOpen(true); }}
            sx={{ borderTop: "1px solid var(--border-subtle)", mt: 0.5, fontWeight: 600 }}
          >
            Guardar vista actual
          </MenuItem>
        </Menu>
      </Box>
    </>
  );

  const bulkToolbar = (
    <Box className="cli-bulk-bar">
      <Typography variant="body2">
        <strong>{selected.length}</strong> {selected.length === 1 ? "cuenta seleccionada" : "cuentas seleccionadas"}
      </Typography>
      <Box sx={{ display: "flex", gap: 1 }}>
        <Button variant="ghost" size="small" onClick={() => setSelected([])}>Deseleccionar</Button>
        <Button variant="primary" size="small" startIcon={<CampaignOutlinedIcon />} onClick={() => setCampaignOpen(true)}>
          Enviar a campaña
        </Button>
      </Box>
    </Box>
  );

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Clientes / CRM"
        subtitle="Vista 360° de cada cuenta: valor, segmento, historial y actividad."
        actions={
          <>
            <Permitido permiso="clientes.exportar">
              <Button variant="secondary" startIcon={<GetAppIcon />} onClick={handleExport}>Exportar</Button>
            </Permitido>
            {/* El alta de cuentas no existe como operación: `clientsApi` escribe
                direcciones, etiquetas, segmentos y actividad, pero no crea cuentas. */}
            <Tooltip title="El alta de cuentas todavía no existe como operación: clientsApi escribe direcciones, etiquetas, segmentos y actividad, pero no crea cuentas.">
              <span>
                <Button variant="primary" startIcon={<PersonAddIcon />} disabled>Nuevo cliente</Button>
              </span>
            </Tooltip>
          </>
        }
      />

      <Grid container spacing={2.5}>
        {kpis.map((k) => (
          <Grid key={k.title} size={{ xs: 12, sm: 6, lg: 3 }}>
            <StatCard {...k} />
          </Grid>
        ))}
      </Grid>

      <DataTable
        toolbar={selected.length > 0 ? bulkToolbar : toolbar}
        columns={columns}
        data={data}
        selectable
        selectedIds={selected}
        onSelectionChange={setSelected}
        onRowClick={(a) => navigate(`/clientes/${a.id}`)}
        emptyMessage="No hay clientes en esta vista."
      />

      <Modal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title="Guardar vista"
        subtitle={`Vista rápida «${VIEWS[view].label}»${search ? ` · búsqueda «${search}»` : ""}`}
        actions={
          <>
            <Button variant="ghost" onClick={() => setSaveOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleSaveView}>Guardar</Button>
          </>
        }
      >
        <TextField
          label="Nombre de la vista"
          size="small"
          fullWidth
          autoFocus
          value={viewName}
          onChange={(e) => setViewName(e.target.value)}
          sx={{ mt: 1 }}
        />
      </Modal>

      <Modal
        open={campaignOpen}
        onClose={() => setCampaignOpen(false)}
        title="Enviar a campaña"
        subtitle={`${selected.length} ${selected.length === 1 ? "cuenta" : "cuentas"} · la audiencia se entrega al módulo Marketing`}
        actions={
          <>
            <Button variant="ghost" onClick={() => setCampaignOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleSendCampaign}>Enviar a Marketing</Button>
          </>
        }
      >
        <TextField
          label="Nombre de la campaña / audiencia"
          size="small"
          fullWidth
          autoFocus
          value={campaignName}
          onChange={(e) => setCampaignName(e.target.value)}
          placeholder="Ej. Reactivación durmientes Q4"
          sx={{ mt: 1 }}
        />
      </Modal>
    </Box>
  );
};

export default Clientes;
