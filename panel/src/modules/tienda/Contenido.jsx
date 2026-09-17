/**
 * Contenido — la biblioteca del módulo.
 *
 * Tres cosas que se reutilizan en muchas páginas y que por eso no pertenecen a
 * ninguna: los medios, las secciones guardadas y las taxonomías del blog.
 * "Usado en" es lo que evita borrar algo que está al aire.
 */
import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";

import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";

import MediaBox from "./components/preview/MediaBox";
import {
  listMedia, listMediaFolders, createMedia, deleteMedia,
  listSavedSections, deleteSavedSection,
  listAuthors, createAuthor, updateAuthor, deleteAuthor,
  listPostCategories, createPostCategory, updatePostCategory, deletePostCategory,
} from "./api/tiendaApi";
import { blockLabel } from "./lib/blockSchemas";
import { formatDate } from "./lib/time";
import "./Tienda.css";

const PALETTE = ["#4f46e5", "#0f766e", "#b45309", "#be123c", "#7e22ce", "#0891b2", "#334155", "#15803d"];

/* ------------------------------------------------------------------ medios */

const NuevoMedioModal = ({ onClose, onCreated }) => {
  const [form, setForm] = useState({ name: "", alt: "", folder: "Sin carpeta", color: PALETTE[0], label: "" });
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  return (
    <Modal
      open onClose={onClose} maxWidth="xs"
      title="Nuevo medio"
      subtitle="Alta simulada: no hay storage, se guarda el nombre y un color de referencia."
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!form.name.trim()} onClick={() => onCreated(form)}>Agregar</Button>
        </>
      }
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <TextField size="small" fullWidth label="Nombre del archivo" value={form.name} autoFocus onChange={(e) => set({ name: e.target.value })} />
        <TextField size="small" fullWidth label="Etiqueta visible" value={form.label} placeholder={form.name} onChange={(e) => set({ label: e.target.value })} />
        <TextField size="small" fullWidth label="Texto alternativo" value={form.alt} helperText="Para accesibilidad y SEO." onChange={(e) => set({ alt: e.target.value })} />
        <TextField size="small" fullWidth label="Carpeta" value={form.folder} onChange={(e) => set({ folder: e.target.value })} />
        <Box>
          <Typography variant="caption" className="st-field__label">Color de referencia</Typography>
          <Box className="st-palette">
            {PALETTE.map((c) => (
              <button
                key={c} type="button" aria-label={c}
                className={`st-palette__swatch ${form.color === c ? "is-active" : ""}`.trim()}
                style={{ background: c }} onClick={() => set({ color: c })}
              />
            ))}
          </Box>
        </Box>
      </Box>
    </Modal>
  );
};

const MediosTab = () => {
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [folder, setFolder] = useState("");
  const [modal, setModal] = useState(false);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => listMedia({ search, folder: folder || undefined }), [search, folder, version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const folders = useMemo(() => listMediaFolders(), [version]);

  const handleDelete = (asset) => {
    const result = deleteMedia(asset.id);
    if (!result.ok) { showToast(result.error, "error"); return; }
    refresh();
    showToast("Medio eliminado", "success");
  };

  return (
    <Box>
      <Box className="st-toolbar">
        <TextField select size="small" label="Carpeta" value={folder} onChange={(e) => setFolder(e.target.value)} sx={{ minWidth: 170 }}>
          <MenuItem value=""><em>Todas</em></MenuItem>
          {folders.map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
        </TextField>
        <TextField size="small" placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 190 }} />
        <Box sx={{ flex: 1 }} />
        <Button variant="primary" size="small" startIcon={<AddIcon />} onClick={() => setModal(true)}>Nuevo medio</Button>
      </Box>

      {rows.length === 0 ? (
        <Box className="st-placeholder">No hay medios con este filtro.</Box>
      ) : (
        <Box className="st-mediagrid">
          {rows.map((m) => (
            <Box className="st-mediacard" key={m.id}>
              <MediaBox media={m} ratio="4:3" alt={m.alt} />
              <Box className="st-mediacard__body">
                <Box className="st-mediacard__head">
                  <strong>{m.name}</strong>
                  <IconButton size="small" onClick={() => handleDelete(m)} aria-label="eliminar">
                    <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Box>
                <span className="text-tertiary">{m.folder} · {m.width}×{m.height} · {m.sizeKb} KB</span>
                {m.usedIn.length > 0 ? (
                  <span className="st-chip st-chip--muted">
                    En {m.usedIn.map((u) => u.label).join(", ")}
                  </span>
                ) : (
                  <span className="st-chip st-chip--muted">Sin usar</span>
                )}
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {modal && (
        <NuevoMedioModal
          onClose={() => setModal(false)}
          onCreated={(form) => { createMedia(form); setModal(false); refresh(); showToast("Medio agregado", "success"); }}
        />
      )}
    </Box>
  );
};

/* ---------------------------------------------------- secciones guardadas */

const SeccionesTab = () => {
  const { showToast } = useToast();
  const [version, setVersion] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => listSavedSections(), [version]);

  return rows.length === 0 ? (
    <Box className="st-placeholder">
      Todavía no guardaste ninguna sección. En el builder, elegí una sección y usá
      «Guardar como sección reutilizable».
    </Box>
  ) : (
    <Box className="st-savedgrid">
      {rows.map((s) => (
        <Box className="st-savedcard" key={s.id}>
          <Box className="st-savedcard__head">
            <strong>{s.name}</strong>
            <IconButton
              size="small" aria-label="eliminar"
              onClick={() => { deleteSavedSection(s.id); setVersion((v) => v + 1); showToast("Sección eliminada", "info"); }}
            >
              <DeleteOutlineIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>
          {s.description && <span className="st-savedcard__desc">{s.description}</span>}
          <Box className="st-savedcard__blocks">
            {s.section.blocks.map((b, i) => (
              <span className="st-chip st-chip--muted" key={i}>{blockLabel(b.type)}</span>
            ))}
          </Box>
          <span className="text-tertiary">Guardada el {formatDate(s.createdAt)}</span>
        </Box>
      ))}
    </Box>
  );
};

/* ------------------------------------------------- autores y categorías */

const AutorModal = ({ author, onClose, onSaved }) => {
  const [form, setForm] = useState(() => author || { name: "", role: "Redacción", bio: "", avatarColor: PALETTE[0] });
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  return (
    <Modal
      open onClose={onClose} maxWidth="xs"
      title={author ? `Editar «${author.name}»` : "Nuevo autor"}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!form.name.trim()} onClick={() => onSaved(form)}>Guardar</Button>
        </>
      }
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <TextField size="small" fullWidth label="Nombre" value={form.name} autoFocus onChange={(e) => set({ name: e.target.value })} />
        <TextField size="small" fullWidth label="Rol" value={form.role} onChange={(e) => set({ role: e.target.value })} />
        <TextField size="small" fullWidth multiline rows={3} label="Bio" value={form.bio} onChange={(e) => set({ bio: e.target.value })} />
        <Box>
          <Typography variant="caption" className="st-field__label">Color del avatar</Typography>
          <Box className="st-palette">
            {PALETTE.map((c) => (
              <button
                key={c} type="button" aria-label={c}
                className={`st-palette__swatch ${form.avatarColor === c ? "is-active" : ""}`.trim()}
                style={{ background: c }} onClick={() => set({ avatarColor: c })}
              />
            ))}
          </Box>
        </Box>
      </Box>
    </Modal>
  );
};

const CategoriaModal = ({ category, onClose, onSaved }) => {
  const [form, setForm] = useState(() => category || { name: "", slug: "", description: "" });
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  return (
    <Modal
      open onClose={onClose} maxWidth="xs"
      title={category ? `Editar «${category.name}»` : "Nueva categoría de blog"}
      subtitle="Separadas de las categorías de producto a propósito."
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!form.name.trim()} onClick={() => onSaved(form)}>Guardar</Button>
        </>
      }
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <TextField size="small" fullWidth label="Nombre" value={form.name} autoFocus onChange={(e) => set({ name: e.target.value })} />
        <TextField size="small" fullWidth label="Slug" value={form.slug} placeholder="se genera del nombre" onChange={(e) => set({ slug: e.target.value })} />
        <TextField size="small" fullWidth multiline rows={2} label="Descripción" value={form.description} onChange={(e) => set({ description: e.target.value })} />
      </Box>
    </Modal>
  );
};

const TaxonomiasTab = () => {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [authorModal, setAuthorModal] = useState(null);
  const [catModal, setCatModal] = useState(null);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const authors = useMemo(() => listAuthors(), [version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const categories = useMemo(() => listPostCategories(), [version]);

  const remove = (fn, id, okMessage) => {
    const result = fn(id);
    if (!result.ok) { showToast(result.error, "error"); return; }
    refresh();
    showToast(okMessage, "success");
  };

  const authorColumns = [
    {
      field: "name", headerName: "Autor",
      renderCell: (a) => (
        <Box className="st-authorcell">
          <span className="st-avatar" style={{ background: a.avatarColor }} aria-hidden="true">{a.name[0]}</span>
          <span><strong>{a.name}</strong><em>{a.role}</em></span>
        </Box>
      ),
    },
    { field: "bio", headerName: "Bio", renderCell: (a) => <span className="text-tertiary">{a.bio || "—"}</span> },
    { field: "postCount", headerName: "Notas", align: "right", renderCell: (a) => <strong>{a.postCount}</strong> },
    {
      field: "actions", headerName: "", align: "right", width: 48,
      renderCell: (a) => (
        <IconButton size="small" aria-label="eliminar" onClick={(e) => { e.stopPropagation(); remove(deleteAuthor, a.id, "Autor eliminado"); }}>
          <DeleteOutlineIcon sx={{ fontSize: 16 }} />
        </IconButton>
      ),
    },
  ];

  const categoryColumns = [
    { field: "name", headerName: "Categoría", renderCell: (c) => <span><strong>{c.name}</strong> <em className="mono st-subtle">/{c.slug}</em></span> },
    { field: "description", headerName: "Descripción", renderCell: (c) => <span className="text-tertiary">{c.description || "—"}</span> },
    { field: "postCount", headerName: "Notas", align: "right", renderCell: (c) => <strong>{c.postCount}</strong> },
    {
      field: "actions", headerName: "", align: "right", width: 48,
      renderCell: (c) => (
        <IconButton size="small" aria-label="eliminar" onClick={(e) => { e.stopPropagation(); remove(deletePostCategory, c.id, "Categoría eliminada"); }}>
          <DeleteOutlineIcon sx={{ fontSize: 16 }} />
        </IconButton>
      ),
    },
  ];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Box>
        <Box className="st-toolbar">
          <Typography className="st-subtitle">Autores</Typography>
          <Box sx={{ flex: 1 }} />
          <Button variant="secondary" size="small" startIcon={<AddIcon />} onClick={() => setAuthorModal({})}>Nuevo autor</Button>
        </Box>
        <DataTable columns={authorColumns} data={authors} onRowClick={(a) => setAuthorModal({ author: a })} emptyMessage="Sin autores." />
      </Box>

      <Box>
        <Box className="st-toolbar">
          <Typography className="st-subtitle">Categorías de blog</Typography>
          <Box sx={{ flex: 1 }} />
          <Button variant="secondary" size="small" startIcon={<AddIcon />} onClick={() => setCatModal({})}>Nueva categoría</Button>
        </Box>
        <DataTable columns={categoryColumns} data={categories} onRowClick={(c) => setCatModal({ category: c })} emptyMessage="Sin categorías." />
        <Typography variant="caption" className="text-tertiary">
          ¿Buscabas las categorías de producto? Están en{" "}
          <button type="button" className="st-link" onClick={() => navigate("/productos/categorias")}>Productos › Categorías</button>.
        </Typography>
      </Box>

      {authorModal && (
        <AutorModal
          author={authorModal.author}
          onClose={() => setAuthorModal(null)}
          onSaved={(form) => {
            if (authorModal.author) updateAuthor(authorModal.author.id, form);
            else createAuthor(form);
            setAuthorModal(null); refresh(); showToast("Autor guardado", "success");
          }}
        />
      )}

      {catModal && (
        <CategoriaModal
          category={catModal.category}
          onClose={() => setCatModal(null)}
          onSaved={(form) => {
            if (catModal.category) updatePostCategory(catModal.category.id, form);
            else createPostCategory(form);
            setCatModal(null); refresh(); showToast("Categoría guardada", "success");
          }}
        />
      )}
    </Box>
  );
};

/* --------------------------------------------------------------- pantalla */

const Contenido = () => {
  const [tab, setTab] = useState(0);

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Contenido"
        subtitle="Lo que se reutiliza entre páginas: medios, secciones guardadas y las taxonomías del blog."
      />

      <Box className="table-tabs">
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label="Medios" />
          <Tab label="Secciones guardadas" />
          <Tab label="Autores y categorías" />
        </Tabs>
      </Box>

      {tab === 0 && <MediosTab />}
      {tab === 1 && <SeccionesTab />}
      {tab === 2 && <TaxonomiasTab />}
    </Box>
  );
};

export default Contenido;
