/** El formulario de la ficha del proveedor: lo usan el alta (modal) y la edición (detalle). */
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import { CONDICION_IVA, CONDICION_COMPRA, MEDIO_HABITUAL, MODO_CUENTA } from "../api/proveedoresApi";

const ProveedorForm = ({ value, onChange, disabled = false }) => {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, pt: 1 }}>
      <TextField label="Nombre / razón social" size="small" required autoFocus value={value.nombre} onChange={set("nombre")} disabled={disabled} sx={{ gridColumn: "1 / -1" }} />
      <TextField label="CUIT" size="small" value={value.cuit} onChange={set("cuit")} disabled={disabled} />
      <TextField select label="Condición frente al IVA" size="small" value={value.condicionIva} onChange={set("condicionIva")} disabled={disabled}
        helperText="Define si su factura discrimina IVA: un monotributista no lo hace.">
        {Object.entries(CONDICION_IVA).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
      </TextField>
      <TextField label="Dirección" size="small" value={value.direccion} onChange={set("direccion")} disabled={disabled} />
      <TextField label="Teléfono" size="small" value={value.telefono} onChange={set("telefono")} disabled={disabled} />
      <TextField label="Email" size="small" value={value.email} onChange={set("email")} disabled={disabled} />
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
        <FormControlLabel control={<Switch checked={Boolean(value.proveeMercaderia)} onChange={set("proveeMercaderia")} disabled={disabled} />} label="Provee mercadería" />
        <FormControlLabel control={<Switch checked={Boolean(value.proveeGastos)} onChange={set("proveeGastos")} disabled={disabled} />} label="Provee gastos/servicios" />
      </Box>
      <TextField select label="Qué documento emite" size="small" value={value.condicionCompra} onChange={set("condicionCompra")} disabled={disabled}>
        {Object.entries(CONDICION_COMPRA).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
      </TextField>
      <TextField label="% sin factura (default de sus formatos)" size="small" type="number" value={value.porcSinFactura ?? 0} onChange={set("porcSinFactura")} disabled={disabled}
        helperText="0 = todo facturado; 100 = liquidación pura." />
      <TextField select label="Medio de pago habitual" size="small" value={value.medioHabitual ?? ""} onChange={set("medioHabitual")} disabled={disabled}>
        <MenuItem value="">—</MenuItem>
        {Object.entries(MEDIO_HABITUAL).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
      </TextField>
      <TextField label="Plazo de pago (días)" size="small" type="number" value={value.diasPago ?? ""} onChange={set("diasPago")} disabled={disabled} />
      <TextField select label="Modo de cuenta corriente" size="small" value={value.modoCuenta} onChange={set("modoCuenta")} disabled={disabled} sx={{ gridColumn: "1 / -1" }}>
        {Object.entries(MODO_CUENTA).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
      </TextField>
      {value.proveeGastos && (
        <TextField select label="Letra del comprobante de gasto" size="small" value={value.letraGasto ?? ""} onChange={set("letraGasto")} disabled={disabled}>
          <MenuItem value="">—</MenuItem>
          {["A", "B", "C", "X"].map((l) => <MenuItem key={l} value={l}>{l}</MenuItem>)}
        </TextField>
      )}
    </Box>
  );
};

export const aPayload = (v) => ({
  ...v,
  diasPago: v.diasPago === "" || v.diasPago == null ? null : Number(v.diasPago),
  porcSinFactura: Number(v.porcSinFactura) || 0,
  letraGasto: v.letraGasto || "",
  medioHabitual: v.medioHabitual || "",
});

export default ProveedorForm;
