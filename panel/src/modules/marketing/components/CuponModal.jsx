import { useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Checkbox from "@mui/material/Checkbox";
import ListItemText from "@mui/material/ListItemText";
import FormControlLabel from "@mui/material/FormControlLabel";
import InputAdornment from "@mui/material/InputAdornment";

import CasinoOutlinedIcon from "@mui/icons-material/CasinoOutlined";

import Modal from "../../../components/Modal/Modal";
import Button from "../../../components/Button/Button";
import { useToast } from "../../../components/Toast/ToastContext";
import DiscountForm from "./DiscountForm";
import { createCoupon, updateCoupon, generateCode } from "../api/marketingApi";
import { COUPON_ORIGIN } from "../lib/discounts";

const SEGMENTS = [
  { key: "campeon", label: "Campeón / VIP" },
  { key: "leal", label: "Leal / Frecuente" },
  { key: "en_riesgo", label: "En riesgo" },
  { key: "durmiente", label: "Durmiente" },
  { key: "perdido", label: "Perdido" },
  { key: "nuevo", label: "Nuevo" },
];

const CuponModal = ({ coupon, onClose, onSaved }) => {
  const { showToast } = useToast();
  const editing = Boolean(coupon);
  const [form, setForm] = useState(() =>
    coupon
      ? {
          code: coupon.code, description: coupon.description || "",
          discount: coupon.discount,
          minSubtotal: coupon.conditions?.minSubtotal ?? "",
          firstPurchase: Boolean(coupon.conditions?.firstPurchase),
          maxRedemptions: coupon.limits?.maxRedemptions ?? "",
          maxPerCustomer: coupon.limits?.maxPerCustomer ?? 1,
          segments: coupon.restrictToAudience?.segments || [],
          origin: coupon.origin || "manual",
          status: coupon.status,
        }
      : {
          code: "", description: "", discount: { type: "percent", value: 15, maxAmount: 6000 },
          minSubtotal: "", firstPurchase: false, maxRedemptions: "", maxPerCustomer: 1,
          segments: [], origin: "manual", status: "activo",
        }
  );
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const handleSave = () => {
    if (!editing && !form.code.trim()) return showToast("Poné un código o generalo", "warning");
    const payload = {
      code: form.code, description: form.description, discount: form.discount,
      conditions: {
        ...(form.minSubtotal ? { minSubtotal: Number(form.minSubtotal) } : {}),
        ...(form.firstPurchase ? { firstPurchase: true } : {}),
      },
      limits: {
        maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
        maxPerCustomer: Number(form.maxPerCustomer) || 1,
      },
      restrictToAudience: form.segments.length ? { segments: form.segments } : null,
      origin: form.origin,
      status: form.status,
    };
    try {
      const saved = editing ? updateCoupon(coupon.id, payload) : createCoupon(payload);
      showToast(editing ? "Cupón actualizado" : "Cupón creado", "success");
      onSaved(saved);
    } catch (err) {
      showToast(err.message, "warning");
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? `Editar cupón ${coupon.code}` : "Nuevo cupón"}
      subtitle="Descuento que el cliente activa ingresando el código en el checkout."
      actions={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={handleSave}>Guardar</Button></>}
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, pt: 1 }}>
        <TextField
          size="small" fullWidth label="Código" value={form.code}
          onChange={(e) => set({ code: e.target.value.toUpperCase() })}
          disabled={editing}
          slotProps={{ input: { endAdornment: !editing && (
            <InputAdornment position="end">
              <Button variant="ghost" size="small" startIcon={<CasinoOutlinedIcon />} onClick={() => set({ code: generateCode("CHECAT") })}>Generar</Button>
            </InputAdornment>
          ) } }}
        />
        <TextField size="small" fullWidth label="Descripción" value={form.description} onChange={(e) => set({ description: e.target.value })} />

        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Descuento</Typography>
          <DiscountForm value={form.discount} onChange={(discount) => set({ discount })} />
        </Box>

        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Condiciones y límites</Typography>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
            <TextField size="small" type="number" label="Compra mínima ($)" value={form.minSubtotal} onChange={(e) => set({ minSubtotal: e.target.value })} sx={{ maxWidth: 160 }} />
            <TextField size="small" type="number" label="Usos totales" value={form.maxRedemptions} onChange={(e) => set({ maxRedemptions: e.target.value })} sx={{ maxWidth: 130 }} />
            <TextField size="small" type="number" label="Usos por cliente" value={form.maxPerCustomer} onChange={(e) => set({ maxPerCustomer: e.target.value })} sx={{ maxWidth: 140 }} />
            <FormControlLabel control={<Checkbox size="small" checked={form.firstPurchase} onChange={(e) => set({ firstPurchase: e.target.checked })} />} label="Primera compra" />
          </Box>
        </Box>

        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "flex-start" }}>
          <Box>
            <Typography variant="caption" color="text.secondary" display="block">Restringir a segmentos (audiencia)</Typography>
            <Select
              size="small" multiple displayEmpty value={form.segments}
              onChange={(e) => set({ segments: e.target.value })}
              renderValue={(v) => (v.length ? `${v.length} segmento(s)` : "Sin restricción")}
              sx={{ minWidth: 200 }}
            >
              {SEGMENTS.map((s) => (
                <MenuItem key={s.key} value={s.key}>
                  <Checkbox size="small" checked={form.segments.includes(s.key)} />
                  <ListItemText primary={s.label} />
                </MenuItem>
              ))}
            </Select>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary" display="block">Origen</Typography>
            <Select size="small" value={form.origin} onChange={(e) => set({ origin: e.target.value })} sx={{ minWidth: 150 }}>
              {Object.entries(COUPON_ORIGIN).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
            </Select>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary" display="block">Estado</Typography>
            <Select size="small" value={form.status} onChange={(e) => set({ status: e.target.value })} sx={{ minWidth: 130 }}>
              <MenuItem value="activo">Activo</MenuItem>
              <MenuItem value="pausado">Pausado</MenuItem>
            </Select>
          </Box>
        </Box>
      </Box>
    </Modal>
  );
};

export default CuponModal;
