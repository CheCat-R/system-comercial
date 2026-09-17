/**
 * Blog — la lista de notas.
 *
 * Una nota **es una página**: al abrirla cae en el mismo Store Builder. Lo único
 * propio son el extracto, el autor, las categorías y la portada, que se editan
 * en "Datos de la página" (`PageSettingsModal`).
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

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";

import {
  listPosts, listPostCategories, listAuthors, createPage,
  duplicatePage, deletePage, PAGE_STATE_META,
} from "./api/tiendaApi";
import { formatDate, relativeFromToday } from "./lib/time";
import "./Tienda.css";

const TABS = [
  { label: "Todas", state: null },
  { label: "Publicadas", state: "publicada" },
  { label: "Con cambios", state: "cambios_pendientes" },
  { label: "Borradores", state: "borrador" },
];

const NuevaNotaModal = ({ onClose, onCreated }) => {
  const [form, setForm] = useState({ title: "", slug: "" });
  return (
    <Modal
      open onClose={onClose} maxWidth="xs"
      title="Nueva nota"
      subtitle="Arranca con el encabezado y un párrafo. El resto lo armás en el builder."
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!form.title.trim()} onClick={() => onCreated(form)}>Crear y editar</Button>
        </>
      }
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <TextField
          size="small" fullWidth label="Título" value={form.title} autoFocus
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        />
        <TextField
          size="small" fullWidth label="Slug" value={form.slug}
          placeholder={form.title ? "se genera del título" : "mi-nota"}
          helperText="La dirección pública: /blog/…"
          onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
        />
      </Box>
    </Modal>
  );
};

const Blog = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [modal, setModal] = useState(false);
  const [anchor, setAnchor] = useState(null);
  const [activeRow, setActiveRow] = useState(null);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => listPosts({ state: TABS[tab].state, search, categoryId: categoryId || undefined }), [tab, search, categoryId, version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const categories = useMemo(() => listPostCategories(), [version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const authors = useMemo(() => listAuthors(), [version]);

  const handleCreate = (form) => {
    const page = createPage({ ...form, type: "post" });
    setModal(false);
    showToast("Nota creada", "success");
    navigate(`/tienda/paginas/${page.id}`);
  };

  const handleDelete = () => {
    const result = deletePage(activeRow.id);
    setAnchor(null);
    if (!result.ok) { showToast(result.error, "error"); return; }
    refresh();
    showToast("Nota eliminada", "success");
  };

  const columns = [
    {
      field: "title", headerName: "Nota",
      renderCell: (p) => (
        <Box className="st-pagecell">
          <span>
            <strong>{p.title}</strong>
            <em className="mono">/blog/{p.slug}</em>
          </span>
        </Box>
      ),
    },
    {
      field: "categories", headerName: "Categorías",
      renderCell: (p) =>
        p.postData?.categoryNames.length
          ? <span className="text-tertiary">{p.postData.categoryNames.join(" · ")}</span>
          : <span className="text-tertiary">—</span>,
    },
    {
      field: "author", headerName: "Autor",
      renderCell: (p) => (
        <Box className="st-authorcell">
          <span className="st-avatar" style={{ background: p.postData?.authorColor }} aria-hidden="true">
            {p.postData?.authorName?.[0] || "?"}
          </span>
          <span>{p.postData?.authorName || "—"}</span>
        </Box>
      ),
    },
    {
      field: "state", headerName: "Estado", align: "center",
      renderCell: (p) => {
        const meta = PAGE_STATE_META[p.state] || { label: p.state, tone: "neutral" };
        return <StatusBadge tone={meta.tone} label={meta.label} />;
      },
    },
    {
      field: "publishedAt", headerName: "Publicada",
      renderCell: (p) =>
        p.postData?.publishedAt
          ? <span className="text-tertiary nowrap">{formatDate(p.postData.publishedAt)}</span>
          : <span className="text-tertiary">—</span>,
    },
    {
      field: "updatedAt", headerName: "Editada",
      renderCell: (p) => <span className="text-tertiary nowrap">{relativeFromToday(p.updatedAt)}</span>,
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

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Blog"
        subtitle={`${rows.length} nota(s) · ${categories.length} categorías · ${authors.length} autores. Se editan en el mismo builder que las páginas.`}
        actions={
          <Button variant="primary" startIcon={<AddIcon />} onClick={() => setModal(true)}>
            Nueva nota
          </Button>
        }
      />

      <Box className="table-tabs">
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons={false}>
          {TABS.map((t) => <Tab key={t.label} label={t.label} />)}
        </Tabs>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
          <TextField
            select size="small" label="Categoría" value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)} sx={{ minWidth: 170 }}
          >
            <MenuItem value=""><em>Todas</em></MenuItem>
            {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name} ({c.postCount})</MenuItem>)}
          </TextField>
          <TextField
            size="small" placeholder="Buscar…" value={search}
            onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 190 }}
          />
        </Box>
      </Box>

      <DataTable
        columns={columns} data={rows}
        onRowClick={(p) => navigate(`/tienda/paginas/${p.id}`)}
        emptyMessage="No hay notas con este filtro."
      />

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => { navigate(`/tienda/paginas/${activeRow.id}`); setAnchor(null); }}>Editar</MenuItem>
        <MenuItem onClick={() => { duplicatePage(activeRow.id); setAnchor(null); refresh(); showToast("Nota duplicada", "success"); }}>
          Duplicar
        </MenuItem>
        <MenuItem onClick={handleDelete}>Eliminar</MenuItem>
      </Menu>

      {modal && <NuevaNotaModal onClose={() => setModal(false)} onCreated={handleCreate} />}
    </Box>
  );
};

export default Blog;
