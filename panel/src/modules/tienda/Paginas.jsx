/**
 * Páginas — todas: home, landings, institucionales y de sistema.
 * La home encabeza siempre la lista y no se puede borrar ni archivar.
 */
import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Menu from "@mui/material/Menu";
import IconButton from "@mui/material/IconButton";

import AddIcon from "@mui/icons-material/Add";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import useVistaGuardada from "../../hooks/useVistaGuardada";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";

import {
  listPages, createPage, duplicatePage, archivePage, deletePage,
  PAGE_STATE_META, PAGE_TYPES, PAGE_TEMPLATES,
} from "./api/tiendaApi";
import { relativeFromToday } from "./lib/time";
import "./Tienda.css";

const TABS = [
  { label: "Todas", type: null },
  { label: "Landings", type: "landing" },
  { label: "Institucionales", type: "institucional" },
  { label: "Sistema", type: "sistema" },
];

const TYPE_LABEL = Object.fromEntries(PAGE_TYPES.map((t) => [t.value, t.label]));

const NuevaPaginaModal = ({ onClose, onCreated }) => {
  const [form, setForm] = useState({ type: "landing", title: "", slug: "", template: "blank" });
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  return (
    <Modal
      open onClose={onClose} maxWidth="sm"
      title="Nueva página"
      subtitle="Elegí el tipo y con qué estructura arranca. Después se edita en el builder."
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!form.title.trim()} onClick={() => onCreated(form)}>Crear y editar</Button>
        </>
      }
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <TextField
          select size="small" fullWidth label="Tipo" value={form.type}
          onChange={(e) => set({ type: e.target.value })}
        >
          {PAGE_TYPES.filter((t) => t.value !== "home").map((t) => (
            <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
          ))}
        </TextField>

        <TextField
          size="small" fullWidth label="Título" value={form.title} autoFocus
          onChange={(e) => set({ title: e.target.value, slug: form.slug || "" })}
        />

        <TextField
          size="small" fullWidth label="Slug" value={form.slug}
          placeholder={form.title ? "se genera del título" : "mi-pagina"}
          helperText="Es la dirección pública de la página."
          onChange={(e) => set({ slug: e.target.value })}
        />

        <TextField
          select size="small" fullWidth label="Estructura inicial" value={form.template}
          onChange={(e) => set({ template: e.target.value })}
        >
          {PAGE_TEMPLATES.map((t) => (
            <MenuItem key={t.value} value={t.value}>{t.label} — {t.hint}</MenuItem>
          ))}
        </TextField>
      </Box>
    </Modal>
  );
};

const Paginas = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { filtros, setFiltros } = useVistaGuardada("paginas", { tab: 0, search: "" });
  const { tab, search } = filtros;
  const [modal, setModal] = useState(false);
  const [anchor, setAnchor] = useState(null);
  const [activeRow, setActiveRow] = useState(null);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => listPages({ type: TABS[tab].type, search }), [tab, search, version]);

  const handleCreate = (form) => {
    const page = createPage(form);
    setModal(false);
    showToast("Página creada", "success");
    navigate(`/tienda/paginas/${page.id}`);
  };

  const runAction = (fn, okMessage) => {
    const result = fn(activeRow.id);
    setAnchor(null);
    if (result && result.ok === false) {
      showToast(result.error, "error");
      return;
    }
    refresh();
    showToast(okMessage, "success");
  };

  const columns = [
    {
      field: "title", headerName: "Página",
      renderCell: (p) => (
        <Box className="st-pagecell">
          {p.type === "home" && <HomeOutlinedIcon sx={{ fontSize: 16 }} className="st-pagecell__icon" />}
          <span>
            <strong>{p.title}</strong>
            <em className="mono">{p.slug}</em>
          </span>
        </Box>
      ),
    },
    {
      field: "type", headerName: "Tipo", align: "center",
      renderCell: (p) => <StatusBadge tone="neutral" label={TYPE_LABEL[p.type] || p.type} showDot={false} />,
    },
    {
      field: "state", headerName: "Estado", align: "center",
      renderCell: (p) => {
        const meta = PAGE_STATE_META[p.state] || { label: p.state, tone: "neutral" };
        return <StatusBadge tone={meta.tone} label={meta.label} />;
      },
    },
    {
      field: "blockCount", headerName: "Contenido", align: "center",
      renderCell: (p) => <span className="text-tertiary">{p.sectionCount} secc. · {p.blockCount} bloques</span>,
    },
    {
      field: "issues", headerName: "Atención", align: "center",
      renderCell: (p) =>
        p.issues.length ? (
          <StatusBadge
            tone={p.issues.some((i) => i.level === "error") ? "danger" : "warning"}
            label={String(p.issues.length)}
          />
        ) : <span className="text-tertiary">—</span>,
    },
    {
      field: "updatedAt", headerName: "Última edición",
      renderCell: (p) => (
        <span className="text-tertiary nowrap">{relativeFromToday(p.updatedAt)} · {p.updatedBy}</span>
      ),
    },
    {
      field: "actions", headerName: "", align: "right", width: 48,
      renderCell: (p) => (
        <IconButton
          size="small" aria-label="acciones"
          onClick={(e) => { e.stopPropagation(); setAnchor(e.currentTarget); setActiveRow(p); }}
        >
          <MoreVertIcon fontSize="small" />
        </IconButton>
      ),
    },
  ];

  const locked = activeRow?.type === "home" || activeRow?.type === "sistema";

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Páginas"
        subtitle="Home, landings, institucionales y páginas de sistema. Todas se editan en el mismo builder."
        actions={
          <Button variant="primary" startIcon={<AddIcon />} onClick={() => setModal(true)}>
            Nueva página
          </Button>
        }
      />

      <Box className="table-tabs">
        <Tabs value={tab} onChange={(_, v) => setFiltros({ tab: v })}>
          {TABS.map((t) => <Tab key={t.label} label={t.label} />)}
        </Tabs>
        <TextField
          size="small" placeholder="Buscar por título o slug…"
          value={search} onChange={(e) => setFiltros({ search: e.target.value })}
          sx={{ minWidth: 240 }}
        />
      </Box>

      <DataTable
        columns={columns} data={rows}
        onRowClick={(p) => navigate(`/tienda/paginas/${p.id}`)}
        emptyMessage="No hay páginas con este filtro."
      />

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => { navigate(`/tienda/paginas/${activeRow.id}`); setAnchor(null); }}>Editar</MenuItem>
        <MenuItem onClick={() => { duplicatePage(activeRow.id); setAnchor(null); refresh(); showToast("Página duplicada", "success"); }}>
          Duplicar
        </MenuItem>
        <MenuItem disabled={locked} onClick={() => runAction(archivePage, "Página archivada")}>Archivar</MenuItem>
        <MenuItem disabled={locked} onClick={() => runAction(deletePage, "Página eliminada")}>Eliminar</MenuItem>
      </Menu>

      {modal && <NuevaPaginaModal onClose={() => setModal(false)} onCreated={handleCreate} />}
    </Box>
  );
};

export default Paginas;
