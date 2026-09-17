/**
 * Apariencia — el aspecto del sitio, con vista previa en vivo.
 *
 * Set cerrado a propósito (§9.9): paletas y pares tipográficos curados, no un
 * selector de color libre. Lo que se edita acá **no** vive en ninguna página:
 * header, footer y anuncio superior son del sitio.
 */
import { useState, useMemo, useCallback } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";

import PageHeader from "../../components/PageHeader/PageHeader";
import Permitido from "../seguridad/components/Permitido";
import Button from "../../components/Button/Button";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useToast } from "../../components/Toast/ToastContext";

import PagePreview from "./components/preview/PagePreview";
import {
  getTheme, updateTheme, resetTheme, listPages, getRenderTree, getReferenceOptions,
} from "./api/tiendaApi";
import {
  PALETTES, TYPE_PRESETS, RADII, DENSITIES, HEADER_LAYOUTS, ANNOUNCEMENT_TONES,
} from "./lib/theme";
import { toInputValue } from "./lib/time";
import "./Tienda.css";

const Field = ({ label, hint, children }) => (
  <Box>
    <Typography variant="caption" className="st-field__label">{label}</Typography>
    {hint && <Typography variant="caption" className="st-field__hint">{hint}</Typography>}
    {children}
  </Box>
);

const Apariencia = () => {
  const { showToast } = useToast();
  const [tab, setTab] = useState(0);
  const [viewport, setViewport] = useState("desktop");
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const [draft, setDraft] = useState(() => getTheme());
  const setGroup = (group, patch) => setDraft((d) => ({ ...d, [group]: { ...d[group], ...patch } }));

  const refs = useMemo(() => getReferenceOptions(), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const saved = useMemo(() => getTheme(), [version]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  // Se previsualiza sobre la home: es la página donde más se nota el tema.
  const home = useMemo(() => listPages({ type: "home" })[0], []);
  const tree = useMemo(() => (home ? getRenderTree(home.id, { source: "draft" }) : { sections: [] }), [home]);

  const handleSave = () => { updateTheme(draft); bump(); showToast("Apariencia guardada", "success"); };
  const handleReset = () => { const t = resetTheme(); setDraft(t); bump(); showToast("Apariencia restablecida", "info"); };

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Apariencia"
        subtitle="Paleta, tipografía, header, footer y anuncio superior. No pertenecen a ninguna página."
        actions={
          <>
            <Button variant="ghost" onClick={handleReset}>Restablecer</Button>
            <Button variant="secondary" disabled={!dirty} onClick={() => setDraft(saved)}>Descartar</Button>
            <Permitido permiso="tienda.tema">
              <Button variant="primary" disabled={!dirty} onClick={handleSave}>Guardar apariencia</Button>
            </Permitido>
          </>
        }
      />

      <Box className="st-apariencia">
        {/* ------------------------------------------------------ controles */}
        <Box className="st-apariencia__form">
          <Box className="table-tabs" sx={{ mb: 0 }}>
            <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons={false}>
              <Tab label="Estilo" />
              <Tab label="Header" />
              <Tab label="Footer" />
              <Tab label="Anuncio" />
            </Tabs>
            {dirty && <StatusBadge tone="warning" label="Sin guardar" />}
          </Box>

          {tab === 0 && (
            <Card className="entity-card">
              <Field label="Color de acento" hint="Se usa en botones, precios destacados y enlaces.">
                <Box className="st-palette">
                  {PALETTES.map((p) => (
                    <button
                      key={p.value} type="button" title={p.label} aria-label={p.label}
                      className={`st-palette__swatch st-palette__swatch--lg ${draft.palette.preset === p.value ? "is-active" : ""}`.trim()}
                      style={{ background: p.accent }}
                      onClick={() => setGroup("palette", { preset: p.value })}
                    />
                  ))}
                </Box>
              </Field>

              <Field label="Tipografía">
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {TYPE_PRESETS.map((t) => (
                    <button
                      key={t.value} type="button"
                      className={`st-typecard ${draft.typography.preset === t.value ? "is-active" : ""}`.trim()}
                      onClick={() => setGroup("typography", { preset: t.value })}
                    >
                      <span className="st-typecard__sample" style={{ fontFamily: t.heading }}>Aa</span>
                      <span className="st-typecard__text">
                        <strong>{t.label}</strong>
                        <em>{t.hint}</em>
                      </span>
                    </button>
                  ))}
                </Box>
              </Field>

              <Field label="Esquinas">
                <ToggleButtonGroup
                  size="small" exclusive fullWidth value={draft.shape.radius}
                  onChange={(_, v) => v && setGroup("shape", { radius: v })}
                >
                  {RADII.map((r) => <ToggleButton key={r.value} value={r.value}>{r.label}</ToggleButton>)}
                </ToggleButtonGroup>
              </Field>

              <Field label="Densidad" hint="Cuánto aire dejan las secciones.">
                <ToggleButtonGroup
                  size="small" exclusive fullWidth value={draft.shape.density}
                  onChange={(_, v) => v && setGroup("shape", { density: v })}
                >
                  {DENSITIES.map((d) => <ToggleButton key={d.value} value={d.value}>{d.label}</ToggleButton>)}
                </ToggleButtonGroup>
              </Field>
            </Card>
          )}

          {tab === 1 && (
            <Card className="entity-card">
              <TextField
                size="small" fullWidth label="Marca" value={draft.header.brand || ""}
                helperText="Hasta que haya un logo real, es el texto del encabezado."
                onChange={(e) => setGroup("header", { brand: e.target.value })}
              />
              <TextField
                select size="small" fullWidth label="Menú" value={draft.header.menuId || ""}
                onChange={(e) => setGroup("header", { menuId: e.target.value })}
              >
                <MenuItem value=""><em>Sin menú</em></MenuItem>
                {refs.menus.map((m) => <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>)}
              </TextField>
              <Field label="Disposición">
                <ToggleButtonGroup
                  size="small" exclusive fullWidth value={draft.header.layout}
                  onChange={(_, v) => v && setGroup("header", { layout: v })}
                >
                  {HEADER_LAYOUTS.map((l) => <ToggleButton key={l.value} value={l.value}>{l.label}</ToggleButton>)}
                </ToggleButtonGroup>
              </Field>
              <FormControlLabel
                control={<Checkbox size="small" checked={Boolean(draft.header.sticky)} onChange={(e) => setGroup("header", { sticky: e.target.checked })} />}
                label="Fijo al hacer scroll"
              />
              <FormControlLabel
                control={<Checkbox size="small" checked={Boolean(draft.header.showSearch)} onChange={(e) => setGroup("header", { showSearch: e.target.checked })} />}
                label="Mostrar buscador"
              />
              <FormControlLabel
                control={<Checkbox size="small" checked={Boolean(draft.header.showCart)} onChange={(e) => setGroup("header", { showCart: e.target.checked })} />}
                label="Mostrar carrito"
              />
            </Card>
          )}

          {tab === 2 && (
            <Card className="entity-card">
              <TextField
                select size="small" fullWidth label="Menús del pie"
                value={draft.footer.menuIds || []}
                slotProps={{ select: { multiple: true, renderValue: (v) => (v.length ? `${v.length} menú(s)` : "Ninguno") } }}
                onChange={(e) => setGroup("footer", { menuIds: e.target.value })}
              >
                {refs.menus.map((m) => (
                  <MenuItem key={m.id} value={m.id}>
                    <Checkbox size="small" checked={(draft.footer.menuIds || []).includes(m.id)} />
                    {m.name}
                  </MenuItem>
                ))}
              </TextField>
              <FormControlLabel
                control={<Checkbox size="small" checked={Boolean(draft.footer.showSocial)} onChange={(e) => setGroup("footer", { showSocial: e.target.checked })} />}
                label="Mostrar redes sociales"
              />
              <FormControlLabel
                control={<Checkbox size="small" checked={Boolean(draft.footer.showPayments)} onChange={(e) => setGroup("footer", { showPayments: e.target.checked })} />}
                label="Mostrar medios de pago"
              />
              <TextField
                size="small" fullWidth multiline rows={2} label="Datos legales"
                value={draft.footer.note || ""}
                onChange={(e) => setGroup("footer", { note: e.target.value })}
              />
            </Card>
          )}

          {tab === 3 && (
            <Card className="entity-card">
              <FormControlLabel
                control={<Checkbox size="small" checked={Boolean(draft.announcement.enabled)} onChange={(e) => setGroup("announcement", { enabled: e.target.checked })} />}
                label="Mostrar la barra de anuncio"
              />
              <TextField
                size="small" fullWidth label="Texto" value={draft.announcement.text || ""}
                slotProps={{ htmlInput: { maxLength: 90 } }}
                onChange={(e) => setGroup("announcement", { text: e.target.value })}
              />
              <TextField
                size="small" fullWidth label="Destino" value={draft.announcement.href || ""}
                onChange={(e) => setGroup("announcement", { href: e.target.value })}
              />
              <Field label="Tono">
                <ToggleButtonGroup
                  size="small" exclusive fullWidth value={draft.announcement.tone}
                  onChange={(_, v) => v && setGroup("announcement", { tone: v })}
                >
                  {ANNOUNCEMENT_TONES.map((t) => <ToggleButton key={t.value} value={t.value}>{t.label}</ToggleButton>)}
                </ToggleButtonGroup>
              </Field>
              <Box sx={{ display: "flex", gap: 1.5 }}>
                <TextField
                  size="small" fullWidth type="datetime-local" label="Desde"
                  slotProps={{ inputLabel: { shrink: true } }}
                  value={toInputValue(draft.announcement.startsAt)}
                  onChange={(e) => setGroup("announcement", { startsAt: e.target.value ? `${e.target.value}:00` : null })}
                />
                <TextField
                  size="small" fullWidth type="datetime-local" label="Hasta"
                  slotProps={{ inputLabel: { shrink: true } }}
                  value={toInputValue(draft.announcement.endsAt)}
                  onChange={(e) => setGroup("announcement", { endsAt: e.target.value ? `${e.target.value}:00` : null })}
                />
              </Box>
              <Typography variant="caption" className="text-tertiary">
                Fuera de la vigencia la barra no se muestra, aunque esté activada.
              </Typography>
            </Card>
          )}
        </Box>

        {/* -------------------------------------------------- vista previa */}
        <Box className="st-apariencia__preview">
          <Box className="st-toolbar" sx={{ mb: 1 }}>
            <Typography className="st-subtitle">Vista previa · Inicio</Typography>
            <Box sx={{ flex: 1 }} />
            <ToggleButtonGroup size="small" exclusive value={viewport} onChange={(_, v) => v && setViewport(v)}>
              <ToggleButton value="desktop">Escritorio</ToggleButton>
              <ToggleButton value="mobile">Mobile</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <PagePreview sections={tree.sections} page={home} viewport={viewport} theme={draft} fit chrome />
        </Box>
      </Box>
    </Box>
  );
};

export default Apariencia;
