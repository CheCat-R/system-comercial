/**
 * Datos de la página: identidad, SEO y —si es una nota— los campos propios del
 * post (extracto, autor, categorías, portada, fecha).
 *
 * Vive fuera del inspector a propósito: el inspector edita **un bloque**, esto
 * edita **la página**. Mezclarlos confunde qué se está tocando.
 */
import { useState, useMemo } from "react";
import Box from "@mui/material/Box";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Typography from "@mui/material/Typography";

import Modal from "../../../components/Modal/Modal";
import Button from "../../../components/Button/Button";
import { updatePage, getReferenceOptions } from "../api/tiendaApi";
import { toInputValue } from "../lib/time";

/** Google recorta el título cerca de los 60 y la descripción cerca de los 155. */
const SEO_LIMITS = { title: 60, description: 155 };

const Counter = ({ value, max }) => {
  const length = (value || "").length;
  const tone = length === 0 ? "" : length > max ? "is-over" : length > max * 0.9 ? "is-near" : "is-ok";
  return <span className={`st-counter ${tone}`.trim()}>{length}/{max}</span>;
};

const PageSettingsModal = ({ page, onClose, onSaved }) => {
  const isPost = page.type === "post";
  const [tab, setTab] = useState(0);
  const [form, setForm] = useState(() => ({
    title: page.title,
    slug: page.slug,
    seo: { title: "", description: "", ogMediaId: "", noindex: false, ...(page.seo || {}) },
    post: {
      excerpt: "", authorId: "", categoryIds: [], coverMediaId: "", publishedAt: null,
      ...(page.post || {}),
    },
  }));

  const refs = useMemo(() => getReferenceOptions(), []);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setSeo = (patch) => setForm((f) => ({ ...f, seo: { ...f.seo, ...patch } }));
  const setPost = (patch) => setForm((f) => ({ ...f, post: { ...f.post, ...patch } }));

  const handleSave = () => {
    updatePage(page.id, {
      title: form.title,
      slug: form.slug,
      seo: { ...form.seo, ogMediaId: form.seo.ogMediaId || null },
      ...(isPost
        ? {
          post: {
            ...form.post,
            coverMediaId: form.post.coverMediaId || null,
            authorId: form.post.authorId || null,
            // La descripción SEO de una nota es su extracto: no tiene sentido
            // pedir el mismo texto dos veces.
            publishedAt: form.post.publishedAt || null,
          },
          seo: { ...form.seo, description: form.seo.description || form.post.excerpt, ogMediaId: form.seo.ogMediaId || form.post.coverMediaId || null },
        }
        : {}),
    });
    onSaved();
  };

  const tabs = isPost ? ["Identidad", "SEO", "Datos de la nota"] : ["Identidad", "SEO"];

  return (
    <Modal
      open onClose={onClose} maxWidth="sm"
      title="Datos de la página"
      subtitle={`${page.title} · ${page.slug}`}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!form.title.trim()} onClick={handleSave}>Guardar</Button>
        </>
      }
    >
      <Box className="table-tabs" sx={{ mt: -1 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          {tabs.map((t) => <Tab key={t} label={t} />)}
        </Tabs>
      </Box>

      {tab === 0 && (
        <Box className="st-settings">
          <TextField
            size="small" fullWidth label="Título" value={form.title}
            onChange={(e) => set({ title: e.target.value })}
          />
          <TextField
            size="small" fullWidth label="Slug" value={form.slug}
            disabled={page.type === "home" || page.type === "sistema"}
            helperText={
              page.type === "home" || page.type === "sistema"
                ? "Las páginas de sistema y la home tienen ruta fija."
                : "Cambiarlo rompe los enlaces que ya existan a esta página."
            }
            onChange={(e) => set({ slug: e.target.value })}
          />
        </Box>
      )}

      {tab === 1 && (
        <Box className="st-settings">
          <TextField
            size="small" fullWidth label="Título para buscadores"
            value={form.seo.title}
            placeholder={form.title}
            helperText={<Counter value={form.seo.title} max={SEO_LIMITS.title} />}
            onChange={(e) => setSeo({ title: e.target.value })}
          />
          <TextField
            size="small" fullWidth multiline rows={3} label="Descripción"
            value={form.seo.description}
            helperText={<Counter value={form.seo.description} max={SEO_LIMITS.description} />}
            onChange={(e) => setSeo({ description: e.target.value })}
          />
          <TextField
            select size="small" fullWidth label="Imagen para compartir"
            value={form.seo.ogMediaId || ""}
            helperText="La que se ve al pegar el link en WhatsApp o redes."
            onChange={(e) => setSeo({ ogMediaId: e.target.value })}
          >
            <MenuItem value=""><em>Ninguna</em></MenuItem>
            {refs.media.map((m) => <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>)}
          </TextField>
          <FormControlLabel
            control={<Checkbox size="small" checked={Boolean(form.seo.noindex)} onChange={(e) => setSeo({ noindex: e.target.checked })} />}
            label="Pedir a los buscadores que no la indexen"
          />

          <Box className="st-serp">
            <Typography variant="caption" className="st-field__label">Así se vería en un buscador</Typography>
            <span className="st-serp__url">checat.com.ar{page.slug === "/" ? "" : `/${page.slug}`}</span>
            <span className="st-serp__title">{form.seo.title || form.title}</span>
            <span className="st-serp__desc">
              {form.seo.description || <em>Sin descripción: el buscador va a inventar una con el texto de la página.</em>}
            </span>
          </Box>
        </Box>
      )}

      {tab === 2 && isPost && (
        <Box className="st-settings">
          <TextField
            size="small" fullWidth multiline rows={2} label="Extracto"
            value={form.post.excerpt}
            helperText="Se muestra en la lista del blog y se usa como descripción SEO."
            onChange={(e) => setPost({ excerpt: e.target.value })}
          />
          <TextField
            select size="small" fullWidth label="Autor" value={form.post.authorId || ""}
            onChange={(e) => setPost({ authorId: e.target.value })}
          >
            <MenuItem value=""><em>Sin autor</em></MenuItem>
            {refs.authors.map((a) => <MenuItem key={a.id} value={a.id}>{a.name} · {a.role}</MenuItem>)}
          </TextField>
          <TextField
            select size="small" fullWidth label="Categorías"
            value={form.post.categoryIds || []}
            slotProps={{ select: { multiple: true, renderValue: (v) => (v.length ? `${v.length} elegidas` : "Ninguna") } }}
            onChange={(e) => setPost({ categoryIds: e.target.value })}
          >
            {refs.postCategories.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                <Checkbox size="small" checked={(form.post.categoryIds || []).includes(c.id)} />
                {c.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select size="small" fullWidth label="Portada" value={form.post.coverMediaId || ""}
            onChange={(e) => setPost({ coverMediaId: e.target.value })}
          >
            <MenuItem value=""><em>Sin portada</em></MenuItem>
            {refs.media.map((m) => <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>)}
          </TextField>
          <TextField
            size="small" fullWidth type="datetime-local" label="Fecha de publicación"
            slotProps={{ inputLabel: { shrink: true } }}
            value={toInputValue(form.post.publishedAt)}
            helperText="Es la fecha que se muestra en la nota, no cuándo se publica."
            onChange={(e) => setPost({ publishedAt: e.target.value ? `${e.target.value}:00` : null })}
          />
        </Box>
      )}
    </Modal>
  );
};

export default PageSettingsModal;
