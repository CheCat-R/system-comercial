import { useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";

import Modal from "../../../components/Modal/Modal";
import Button from "../../../components/Button/Button";
import { useToast } from "../../../components/Toast/ToastContext";
import DiscountForm from "./DiscountForm";
import { createReward, updateReward } from "../api/marketingApi";
import { pointsToMoney } from "../lib/loyalty";

/** Alta/edición de una Recompensa (catálogo de canje). `program` para mostrar la equivalencia en $. */
const RewardModal = ({ reward, program, onClose, onSaved }) => {
  const { showToast } = useToast();
  const editing = Boolean(reward);
  const [form, setForm] = useState(() =>
    reward
      ? { name: reward.name, pointsCost: reward.pointsCost, discount: reward.discount, status: reward.status }
      : { name: "", pointsCost: 1500, discount: { type: "fixed", value: 2000, scope: "all" }, status: "activa" },
  );
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const handleSave = () => {
    if (!form.name.trim()) return showToast("Poné un nombre para la recompensa", "warning");
    try {
      const saved = editing ? updateReward(reward.id, form) : createReward(form);
      showToast(editing ? "Recompensa actualizada" : "Recompensa creada", "success");
      onSaved(saved);
    } catch (err) {
      showToast(err.message, "warning");
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? `Editar ${reward.name}` : "Nueva recompensa"}
      subtitle="El cliente la obtiene gastando puntos; el descuento se calcula igual que una promo."
      actions={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={handleSave}>Guardar</Button></>}
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, pt: 1 }}>
        <TextField size="small" fullWidth label="Nombre" value={form.name} onChange={(e) => set({ name: e.target.value })} />

        <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
          <TextField
            size="small" type="number" label="Costo en puntos"
            value={form.pointsCost} onChange={(e) => set({ pointsCost: Number(e.target.value) })}
            sx={{ maxWidth: 160 }}
          />
          <Typography variant="caption" color="text.secondary">
            ≈ {pointsToMoney(form.pointsCost, program).toLocaleString("es-AR")} $ de valor de canje
          </Typography>
        </Box>

        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Descuento</Typography>
          <DiscountForm value={form.discount} onChange={(discount) => set({ discount })} />
        </Box>

        <Box>
          <Typography variant="caption" color="text.secondary" display="block">Estado</Typography>
          <Select size="small" value={form.status} onChange={(e) => set({ status: e.target.value })} sx={{ minWidth: 150 }}>
            <MenuItem value="activa">Activa</MenuItem>
            <MenuItem value="inactiva">Inactiva</MenuItem>
          </Select>
        </Box>
      </Box>
    </Modal>
  );
};

export default RewardModal;
