/**
 * Editor de banner con vista previa en vivo.
 *
 * El ancla de texto es una grilla de 9 posiciones: se elige dónde va el titular
 * sobre la imagen sin escribir CSS. Ver docs/MODULO-TIENDA-CMS.md §9.6.
 */
import { useState, useMemo } from "react";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";

import Modal from "../../../components/Modal/Modal";
import Button from "../../../components/Button/Button";
import MediaBox from "./preview/MediaBox";

import { createBanner, updateBanner, getReferenceOptions } from "../api/tiendaApi";
import { toInputValue } from "../lib/time";

const POSITIONS = [
  "top-left", "top", "top-right",
  "center-left", "center", "center-right",
  "bottom-left", "bottom", "bottom-right",
];

const emptyForm = {
  name: "", mediaId: "", mediaMobileId: "",
  headline: "", subheadline: "", cta: { label: "", href: "" },
  position: "center", theme: "light",
  startsAt: null, endsAt: null,
  audienceId: "", promotionId: "", weight: 1, status: "borrador",
};

const BannerModal = ({ banner, onClose, onSaved }) => {
  const [form, setForm] = useState(() =>
    banner
      ? { ...emptyForm, ...banner, cta: { ...emptyForm.cta, ...(banner.cta || {}) }, audienceId: banner.audienceId || "", promotionId: banner.promotionId || "" }
      : emptyForm
  );
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const refs = useMemo(() => getReferenceOptions(), []);
  const media = refs.media.find((m) => m.id === form.mediaId) || null;

  const handleSave = () => {
    const payload = {
      ...form,
      audienceId: form.audienceId || null,
      promotionId: form.promotionId || null,
      weight: Number(form.weight) || 1,
    };
    const saved = banner ? updateBanner(banner.id, payload) : createBanner(payload);
    onSaved(saved);
  };

  return (
    <Modal
      open onClose={onClose} maxWidth="lg"
      title={banner ? `Editar «${banner.name}»` : "Nuevo banner"}
      subtitle="Una creatividad con vigencia propia. Los bloques hero y promocional la referencian."
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!form.name.trim()} onClick={handleSave}>Guardar banner</Button>
        </>
      }
    >
      <Box className="st-bannereditor">
        {/* ------------------------------------------------------- formulario */}
        <Box className="st-bannereditor__form">
          <TextField
            size="small" fullWidth label="Nombre interno" value={form.name} autoFocus
            helperText="Sólo lo ves vos, en la biblioteca y en el editor."
            onChange={(e) => set({ name: e.target.value })}
          />

          <TextField select size="small" fullWidth label="Imagen" value={form.mediaId} onChange={(e) => set({ mediaId: e.target.value })}>
            <MenuItem value=""><em>Sin imagen</em></MenuItem>
            {refs.media.map((m) => <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>)}
          </TextField>

          <TextField select size="small" fullWidth label="Imagen para mobile" value={form.mediaMobileId || ""} onChange={(e) => set({ mediaMobileId: e.target.value })}>
            <MenuItem value=""><em>Usar la misma</em></MenuItem>
            {refs.media.map((m) => <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>)}
          </TextField>

          <TextField size="small" fullWidth label="Titular" value={form.headline} onChange={(e) => set({ headline: e.target.value })} />
          <TextField size="small" fullWidth label="Bajada" value={form.subheadline} onChange={(e) => set({ subheadline: e.target.value })} />

          <Box sx={{ display: "flex", gap: 1.5 }}>
            <TextField size="small" fullWidth label="Texto del botón" value={form.cta.label} onChange={(e) => set({ cta: { ...form.cta, label: e.target.value } })} />
            <TextField size="small" fullWidth label="Destino" value={form.cta.href} onChange={(e) => set({ cta: { ...form.cta, href: e.target.value } })} />
          </Box>

          <Box>
            <Typography variant="caption" className="st-field__label">Posición del texto</Typography>
            <Box className="st-anchorgrid">
              {POSITIONS.map((p) => (
                <button
                  key={p} type="button" aria-label={p}
                  className={`st-anchorgrid__cell ${form.position === p ? "is-active" : ""}`.trim()}
                  onClick={() => set({ position: p })}
                />
              ))}
            </Box>
          </Box>

          <Box>
            <Typography variant="caption" className="st-field__label">Color del texto</Typography>
            <ToggleButtonGroup size="small" exclusive fullWidth value={form.theme} onChange={(_, v) => v && set({ theme: v })}>
              <ToggleButton value="light">Claro sobre imagen</ToggleButton>
              <ToggleButton value="dark">Oscuro sobre imagen</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Box sx={{ display: "flex", gap: 1.5 }}>
            <TextField
              size="small" fullWidth type="datetime-local" label="Desde"
              slotProps={{ inputLabel: { shrink: true } }}
              value={toInputValue(form.startsAt)}
              onChange={(e) => set({ startsAt: e.target.value ? `${e.target.value}:00` : null })}
            />
            <TextField
              size="small" fullWidth type="datetime-local" label="Hasta"
              slotProps={{ inputLabel: { shrink: true } }}
              value={toInputValue(form.endsAt)}
              onChange={(e) => set({ endsAt: e.target.value ? `${e.target.value}:00` : null })}
            />
          </Box>

          <TextField
            select size="small" fullWidth label="Audiencia" value={form.audienceId}
            helperText="Si elegís una, sólo la ve ese segmento."
            onChange={(e) => set({ audienceId: e.target.value })}
          >
            <MenuItem value=""><em>Público general</em></MenuItem>
            {refs.audiences.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
          </TextField>

          <TextField
            select size="small" fullWidth label="Promoción vinculada" value={form.promotionId}
            helperText="Sirve para mostrar el código y para saber qué oferta comunica."
            onChange={(e) => set({ promotionId: e.target.value })}
          >
            <MenuItem value=""><em>Ninguna</em></MenuItem>
            {refs.promotions.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </TextField>

          <Box sx={{ display: "flex", gap: 1.5 }}>
            <TextField
              size="small" fullWidth type="number" label="Peso en rotación" value={form.weight}
              slotProps={{ htmlInput: { min: 1, max: 10 } }}
              onChange={(e) => set({ weight: e.target.value })}
            />
            <TextField select size="small" fullWidth label="Estado" value={form.status} onChange={(e) => set({ status: e.target.value })}>
              <MenuItem value="activo">Publicado</MenuItem>
              <MenuItem value="borrador">Borrador</MenuItem>
            </TextField>
          </Box>
        </Box>

        {/* -------------------------------------------------- vista previa */}
        <Box className="st-bannereditor__preview">
          <Typography className="st-coleditor__previewtitle">Vista previa</Typography>
          <div className={`st-hero st-hero--md st-hero--${form.theme}`}>
            <MediaBox media={media} alt={form.headline} className="st-hero__media">
              <span className="st-hero__scrim" style={{ opacity: 0.25 }} />
              <div className={`st-hero__content st-hero__content--${form.position}`}>
                {form.headline && <h2 className="st-hero__headline">{form.headline}</h2>}
                {form.subheadline && <p className="st-hero__sub">{form.subheadline}</p>}
                {form.cta.label && <span className="st-btn st-btn--primary">{form.cta.label}</span>}
              </div>
            </MediaBox>
          </div>
          <Typography variant="caption" className="text-tertiary">
            Así se ve dentro de un bloque hero. En un banner promocional el alto es menor.
          </Typography>
        </Box>
      </Box>
    </Modal>
  );
};

export default BannerModal;
