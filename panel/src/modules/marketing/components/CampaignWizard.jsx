import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";

import Modal from "../../../components/Modal/Modal";
import Button from "../../../components/Button/Button";
import { useToast } from "../../../components/Toast/ToastContext";
import { listAudiences, listTemplates, listPromotions, listCoupons, createCampaign, updateCampaign, launchCampaign } from "../api/marketingApi";
import { OBJECTIVES, CHANNELS, TRIGGERS } from "../lib/marketing";
import { money } from "../lib/time";
import "../Marketing.css";

const STEPS = ["Objetivo", "Audiencia", "Mensaje", "Oferta", "Calendario"];

const CampaignWizard = ({ campaign, onClose, onDone }) => {
  const { showToast } = useToast();
  const editing = Boolean(campaign);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(() =>
    campaign
      ? { name: campaign.name, objective: campaign.objective, audienceId: campaign.audienceId || "", channel: campaign.channel, templateId: campaign.templateId || "", offer: campaign.offer || { type: "none" }, schedule: campaign.schedule || { type: "once" } }
      : { name: "", objective: "conversion", audienceId: "", channel: "email", templateId: "", offer: { type: "none" }, schedule: { type: "once" } }
  );
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const audiences = useMemo(() => listAudiences(), []);
  const templates = useMemo(() => listTemplates(), []);
  const promotions = useMemo(() => listPromotions({ status: "activa" }), []);
  const coupons = useMemo(() => listCoupons({ status: "activo" }), []);
  const audience = audiences.find((a) => a.id === form.audienceId);

  const save = (launch) => {
    if (!form.name.trim()) { setStep(0); return showToast("Poné un nombre", "warning"); }
    if (!form.audienceId) { setStep(1); return showToast("Elegí una audiencia", "warning"); }
    if (!form.templateId) { setStep(2); return showToast("Elegí una plantilla", "warning"); }
    const saved = editing ? updateCampaign(campaign.id, form) : createCampaign(form);
    if (launch) {
      try {
        launchCampaign(saved.id);
        showToast("Campaña lanzada", "success");
      } catch (err) {
        showToast(err.message, "warning");
      }
    } else {
      showToast(editing ? "Campaña guardada" : "Borrador creado", "success");
    }
    onDone(saved);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? "Editar campaña" : "Nueva campaña"}
      maxWidth="md"
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          {step > 0 && <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>Atrás</Button>}
          {step < STEPS.length - 1 && <Button variant="primary" onClick={() => setStep((s) => s + 1)}>Siguiente</Button>}
          {step === STEPS.length - 1 && <>
            <Button variant="secondary" onClick={() => save(false)}>Guardar borrador</Button>
            <Button variant="primary" onClick={() => save(true)}>Lanzar</Button>
          </>}
        </>
      }
    >
      <Box sx={{ pt: 1 }}>
        <Box className="mkt-wizard-steps">
          {STEPS.map((s, i) => (
            <span key={s} className={`mkt-wizard-step ${i === step ? "mkt-wizard-step--active" : i < step ? "mkt-wizard-step--done" : ""}`}>{i + 1}. {s}</span>
          ))}
        </Box>

        {step === 0 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
            <TextField size="small" fullWidth label="Nombre de la campaña" value={form.name} onChange={(e) => set({ name: e.target.value })} />
            <Box>
              <Typography variant="caption" color="text.secondary" display="block">Objetivo</Typography>
              <Select size="small" value={form.objective} onChange={(e) => set({ objective: e.target.value })} sx={{ minWidth: 200 }}>
                {Object.entries(OBJECTIVES).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
              </Select>
            </Box>
          </Box>
        )}

        {step === 1 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Select size="small" fullWidth displayEmpty value={form.audienceId} onChange={(e) => set({ audienceId: e.target.value })}>
              <MenuItem value="" disabled>Elegí una audiencia…</MenuItem>
              {audiences.map((a) => <MenuItem key={a.id} value={a.id}>{a.name} · {a.memberCount} cuenta(s)</MenuItem>)}
            </Select>
            {audience && <Typography variant="body2" color="text.secondary">{audience.memberCount} cuenta(s) recibirán esta campaña (los dados de baja del canal se excluyen al lanzar).</Typography>}
          </Box>
        )}

        {step === 2 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
              <Select size="small" value={form.channel} onChange={(e) => set({ channel: e.target.value, templateId: "" })} sx={{ minWidth: 130 }}>
                {Object.entries(CHANNELS).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}
              </Select>
              <Select size="small" displayEmpty value={form.templateId} onChange={(e) => set({ templateId: e.target.value })} sx={{ minWidth: 240 }}>
                <MenuItem value="" disabled>Elegí una plantilla…</MenuItem>
                {templates.filter((t) => t.channel === form.channel).map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
              </Select>
            </Box>
            <Typography variant="caption" color="text.secondary">Las plantillas se gestionan en Comunicación.</Typography>
          </Box>
        )}

        {step === 3 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Select size="small" value={form.offer.type} onChange={(e) => set({ offer: { type: e.target.value } })} sx={{ minWidth: 200 }}>
              <MenuItem value="none">Sin oferta</MenuItem>
              <MenuItem value="coupon">Cupón</MenuItem>
              <MenuItem value="promotion">Promoción</MenuItem>
            </Select>
            {form.offer.type === "coupon" && (
              <Select size="small" displayEmpty value={form.offer.couponCode || ""} onChange={(e) => set({ offer: { type: "coupon", couponCode: e.target.value } })} sx={{ minWidth: 220 }}>
                <MenuItem value="" disabled>Elegí un cupón…</MenuItem>
                {coupons.map((c) => <MenuItem key={c.id} value={c.code}>{c.code}</MenuItem>)}
              </Select>
            )}
            {form.offer.type === "promotion" && (
              <Select size="small" displayEmpty value={form.offer.promotionId || ""} onChange={(e) => set({ offer: { type: "promotion", promotionId: e.target.value } })} sx={{ minWidth: 260 }}>
                <MenuItem value="" disabled>Elegí una promoción…</MenuItem>
                {promotions.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
              </Select>
            )}
          </Box>
        )}

        {step === 4 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
            <Box>
              <Typography variant="caption" color="text.secondary" display="block">Tipo de envío</Typography>
              <Select size="small" value={form.schedule.type} onChange={(e) => set({ schedule: { ...form.schedule, type: e.target.value } })} sx={{ minWidth: 200 }}>
                <MenuItem value="once">Una vez</MenuItem>
                <MenuItem value="recurring">Recurrente</MenuItem>
                <MenuItem value="triggered">Automática (trigger)</MenuItem>
              </Select>
            </Box>
            {form.schedule.type === "triggered" && (
              <Select size="small" value={form.schedule.trigger || "abandoned_cart"} onChange={(e) => set({ schedule: { ...form.schedule, trigger: e.target.value } })} sx={{ minWidth: 220 }}>
                {Object.entries(TRIGGERS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
              </Select>
            )}

            <Box sx={{ p: 2, borderRadius: "var(--radius-sm)", background: "var(--bg-sunken)", border: "1px solid var(--border-subtle)", fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
              <div><strong>{form.name || "Sin nombre"}</strong> · {OBJECTIVES[form.objective]}</div>
              <div>Audiencia: {audience?.name || "—"} ({audience?.memberCount ?? 0} cuentas) · Canal: {CHANNELS[form.channel]?.label}</div>
              <div>Oferta: {form.offer.type === "none" ? "ninguna" : form.offer.type === "coupon" ? `cupón ${form.offer.couponCode || "—"}` : `promoción`}</div>
              {audience && <div className="text-tertiary">Costo estimado: {money((audience.memberCount || 0) * (CHANNELS[form.channel]?.cost || 0))}</div>}
            </Box>
          </Box>
        )}
      </Box>
    </Modal>
  );
};

export default CampaignWizard;
