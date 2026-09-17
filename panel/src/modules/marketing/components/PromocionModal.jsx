import { useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";

import Modal from "../../../components/Modal/Modal";
import Button from "../../../components/Button/Button";
import { useToast } from "../../../components/Toast/ToastContext";
import DiscountForm from "./DiscountForm";
import CartPreview from "./CartPreview";
import { createPromotion, updatePromotion } from "../api/marketingApi";

const EMPTY = {
  name: "", description: "",
  discount: { type: "percent", value: 10 },
  minSubtotal: "", firstPurchase: false, channel: "all",
  stackable: false, priority: 10, status: "borrador",
};

const PromocionModal = ({ promotion, onClose, onSaved }) => {
  const { showToast } = useToast();
  const editing = Boolean(promotion);
  const [form, setForm] = useState(() =>
    promotion
      ? {
          name: promotion.name, description: promotion.description || "",
          discount: promotion.discount,
          minSubtotal: promotion.conditions?.minSubtotal ?? "",
          firstPurchase: Boolean(promotion.conditions?.firstPurchase),
          channel: promotion.channel || "all",
          stackable: Boolean(promotion.stackable),
          priority: promotion.priority ?? 10,
          status: promotion.status,
        }
      : EMPTY
  );
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const handleSave = () => {
    if (!form.name.trim()) return showToast("Poné un nombre", "warning");
    const payload = {
      name: form.name, description: form.description, discount: form.discount,
      conditions: {
        ...(form.minSubtotal ? { minSubtotal: Number(form.minSubtotal) } : {}),
        ...(form.firstPurchase ? { firstPurchase: true } : {}),
      },
      channel: form.channel, stackable: form.stackable, priority: Number(form.priority) || 10,
      status: form.status,
    };
    const saved = editing ? updatePromotion(promotion.id, payload) : createPromotion(payload);
    showToast(editing ? "Promoción actualizada" : "Promoción creada", "success");
    onSaved(saved);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? "Editar promoción" : "Nueva promoción"}
      subtitle="Descuento automático — se aplica solo si el carrito cumple las condiciones."
      maxWidth="md"
      actions={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={handleSave}>Guardar</Button></>}
    >
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 260px" }, gap: 3, pt: 1 }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
          <TextField size="small" fullWidth label="Nombre" value={form.name} onChange={(e) => set({ name: e.target.value })} />
          <TextField size="small" fullWidth label="Descripción" value={form.description} onChange={(e) => set({ description: e.target.value })} />

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Descuento</Typography>
            <DiscountForm value={form.discount} onChange={(discount) => set({ discount })} />
          </Box>

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Condiciones</Typography>
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
              <TextField size="small" type="number" label="Compra mínima ($)" value={form.minSubtotal} onChange={(e) => set({ minSubtotal: e.target.value })} sx={{ maxWidth: 170 }} />
              <Select size="small" value={form.channel} onChange={(e) => set({ channel: e.target.value })} sx={{ minWidth: 140 }}>
                <MenuItem value="all">Todos los canales</MenuItem>
                <MenuItem value="online">Tienda web</MenuItem>
                <MenuItem value="b2b">Mayorista B2B</MenuItem>
              </Select>
              <FormControlLabel control={<Checkbox size="small" checked={form.firstPurchase} onChange={(e) => set({ firstPurchase: e.target.checked })} />} label="Primera compra" />
            </Box>
          </Box>

          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
            <FormControlLabel control={<Checkbox size="small" checked={form.stackable} onChange={(e) => set({ stackable: e.target.checked })} />} label="Se combina con otras" />
            <TextField size="small" type="number" label="Prioridad" value={form.priority} onChange={(e) => set({ priority: e.target.value })} sx={{ maxWidth: 110 }} />
            <Select size="small" value={form.status} onChange={(e) => set({ status: e.target.value })} sx={{ minWidth: 140 }}>
              <MenuItem value="borrador">Borrador</MenuItem>
              <MenuItem value="programada">Programada</MenuItem>
              <MenuItem value="activa">Activa</MenuItem>
              <MenuItem value="pausada">Pausada</MenuItem>
            </Select>
          </Box>
        </Box>

        <CartPreview discount={form.discount} />
      </Box>
    </Modal>
  );
};

export default PromocionModal;
