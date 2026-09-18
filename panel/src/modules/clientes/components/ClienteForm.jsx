/**
 * La ficha del cliente: identidad fiscal, contacto, comercial (descuento,
 * listas asignadas, vendedor, sucursal) y crédito. Los tres campos del
 * crédito solo se habilitan con la llave `cta_cte`; sin ella se muestran y
 * no se mandan, que es exactamente lo que el servidor exige.
 */
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Autocomplete from "@mui/material/Autocomplete";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import { CONDICIONES_IVA, TIPOS_DOC } from "../../ventas/api/ventasApi";

const ClienteForm = ({ valor, onChange, listas = [], usuarios = [], sucursales = [], puedeCredito, esConsumidorFinal = false }) => {
  const set = (k) => (e) => onChange({ ...valor, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  return (
    <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
        <TextField size="small" label="Nombre o razón social" value={valor.nombre} onChange={set("nombre")} autoFocus required />
        <TextField size="small" label="Nombre de fantasía" value={valor.nombreFantasia} onChange={set("nombreFantasia")} />
        <TextField select size="small" label="Documento" value={valor.tipoDoc} onChange={set("tipoDoc")} disabled={esConsumidorFinal}>{Object.entries(TIPOS_DOC).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}</TextField>
        <TextField size="small" label="Número" value={valor.numeroDoc} onChange={set("numeroDoc")} disabled={esConsumidorFinal} helperText={valor.tipoDoc === "cuit" || valor.tipoDoc === "cuil" ? "11 dígitos" : undefined} />
        <TextField select size="small" label="Condición frente al IVA" value={valor.condicionIva} onChange={set("condicionIva")} disabled={esConsumidorFinal}>{Object.entries(CONDICIONES_IVA).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}</TextField>
        <TextField size="small" label="Teléfono" value={valor.telefono} onChange={set("telefono")} />
        <TextField size="small" label="Dirección" value={valor.direccion} onChange={set("direccion")} />
        <TextField size="small" label="Localidad" value={valor.localidad} onChange={set("localidad")} />
        <TextField size="small" label="Email" value={valor.email} onChange={set("email")} />
        <TextField size="small" type="number" label="Descuento general (%)" value={valor.descuento} onChange={set("descuento")} helperText="Se aplica solo a cada renglón del ticket." />
      </Box>
      <Typography variant="subtitle2">Comercial</Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
        <Autocomplete multiple size="small" options={listas} getOptionLabel={(l) => l.etiqueta} value={listas.filter((l) => (valor.listas || []).includes(l.id))} onChange={(_, v) => onChange({ ...valor, listas: v.map((l) => l.id) })} renderInput={(p) => <TextField {...p} label="Listas de precio asignadas" helperText="Sin ninguna, se cotiza con la lista base." />} />
        <Box sx={{ display: "grid", gap: 2 }}>
          <TextField select size="small" label="Vendedor" value={valor.vendedorId || ""} onChange={set("vendedorId")}><MenuItem value="">—</MenuItem>{usuarios.filter((u) => u.activo).map((u) => <MenuItem key={u.id} value={u.id}>{u.nombre}</MenuItem>)}</TextField>
          <TextField select size="small" label="Sucursal habitual" value={valor.sucursalId || ""} onChange={set("sucursalId")}><MenuItem value="">—</MenuItem>{sucursales.map((s) => <MenuItem key={s.id} value={s.id}>{s.nombre}</MenuItem>)}</TextField>
        </Box>
      </Box>
      <Typography variant="subtitle2">Crédito {!puedeCredito && <Typography component="span" variant="caption" color="text.secondary">(pide la llave «Cuenta corriente»)</Typography>}</Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 2, alignItems: "center" }}>
        <FormControlLabel control={<Switch checked={Boolean(valor.ctaCteHabilitada)} onChange={set("ctaCteHabilitada")} disabled={!puedeCredito || esConsumidorFinal} />} label="Cuenta corriente" />
        <TextField size="small" type="number" label="Límite de crédito (0 = sin tope)" value={valor.limiteCredito} onChange={set("limiteCredito")} disabled={!puedeCredito || esConsumidorFinal} />
        <TextField size="small" type="number" label="Días de plazo" value={valor.diasPlazo} onChange={set("diasPlazo")} disabled={!puedeCredito || esConsumidorFinal} />
      </Box>
      <TextField size="small" label="Observaciones" value={valor.observaciones} onChange={set("observaciones")} multiline minRows={2} />
    </Box>
  );
};

export default ClienteForm;
