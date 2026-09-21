/**
 * Lo operativo del proveedor que no es la ficha: las percepciones que cobra
 * en el pie de su factura (se ofrecen tildadas al cargar el papel) y las
 * cuentas bancarias a las que se le transfiere.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Switch from "@mui/material/Switch";
import IconButton from "@mui/material/IconButton";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import AddIcon from "@mui/icons-material/Add";

import Button from "../../../components/Button/Button";
import { useToast } from "../../../components/Toast/ToastContext";
import { useEstadoDesde } from "../../../hooks/useEstadoDesde";
import { comprasApi } from "../api/comprasApi";

const PercepcionesYCuentas = ({ proveedorId, puede }) => {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const percQ = useQuery({ queryKey: ["proveedor", Number(proveedorId), "percepciones"], queryFn: () => comprasApi.proveedor.percepciones(proveedorId) });
  const ctasQ = useQuery({ queryKey: ["proveedor", Number(proveedorId), "cuentas"], queryFn: () => comprasApi.proveedor.cuentas(proveedorId) });
  const [percs, setPercs] = useEstadoDesde(percQ.data, (x) => (x || []).map((p) => ({ ...p, alicuota: String(p.alicuota) })));
  const [ctas, setCtas] = useEstadoDesde(ctasQ.data, (x) => (x || []).map((c) => ({ ...c })));
  const [guardando, setGuardando] = useState(false);
  const err = (e) => showToast(e?.message || "No se pudo guardar.", "error");
  const mPercs = useMutation({ mutationFn: () => comprasApi.proveedor.setPercepciones(proveedorId, percs.map((p) => ({ nombre: p.nombre, alicuota: Number(p.alicuota) || 0, base: p.base, activa: p.activa !== false }))), onSuccess: () => { showToast("Percepciones guardadas.", "success"); qc.invalidateQueries({ queryKey: ["proveedor", Number(proveedorId)] }); }, onError: err });
  const mCtas = useMutation({ mutationFn: () => comprasApi.proveedor.setCuentas(proveedorId, ctas.map((c) => ({ cbuAlias: c.cbuAlias, descripcion: c.descripcion }))), onSuccess: () => { showToast("Cuentas guardadas.", "success"); qc.invalidateQueries({ queryKey: ["proveedor", Number(proveedorId)] }); }, onError: err });
  const guardar = async () => { setGuardando(true); try { await mPercs.mutateAsync(); await mCtas.mutateAsync(); } finally { setGuardando(false); } };

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Card className="entity-card">
        <Typography className="card-title" sx={{ mb: 1 }}>Percepciones que cobra</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>No son IVA: son pago a cuenta de otro impuesto (RG 5329, Ingresos Brutos). Al cargar una factura se ofrecen tildadas; el papel siempre manda.</Typography>
        <Box sx={{ display: "grid", gap: 1 }}>
          {percs.map((p, i) => (
            <Box key={i} sx={{ display: "grid", gridTemplateColumns: "2fr 100px 130px auto auto", gap: 1, alignItems: "center" }}>
              <TextField size="small" label="Nombre" value={p.nombre} disabled={!puede} onChange={(e) => setPercs(percs.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))} />
              <TextField size="small" type="number" label="%" value={p.alicuota} disabled={!puede} onChange={(e) => setPercs(percs.map((x, j) => (j === i ? { ...x, alicuota: e.target.value } : x)))} />
              <TextField select size="small" label="Base" value={p.base} disabled={!puede} onChange={(e) => setPercs(percs.map((x, j) => (j === i ? { ...x, base: e.target.value } : x)))}><MenuItem value="neto">s/ neto</MenuItem><MenuItem value="total">s/ total</MenuItem></TextField>
              <Switch size="small" checked={p.activa !== false} disabled={!puede} onChange={(e) => setPercs(percs.map((x, j) => (j === i ? { ...x, activa: e.target.checked } : x)))} />
              <IconButton size="small" disabled={!puede} onClick={() => setPercs(percs.filter((_, j) => j !== i))}><DeleteOutlineIcon fontSize="small" /></IconButton>
            </Box>
          ))}
          {puede && <Box><Button size="small" variant="ghost" startIcon={<AddIcon />} onClick={() => setPercs([...percs, { nombre: "", alicuota: "", base: "neto", activa: true }])}>Agregar percepción</Button></Box>}
        </Box>
      </Card>
      <Card className="entity-card">
        <Typography className="card-title" sx={{ mb: 1 }}>Cuentas bancarias (CBU / alias)</Typography>
        <Box sx={{ display: "grid", gap: 1 }}>
          {ctas.map((c, i) => (
            <Box key={i} sx={{ display: "grid", gridTemplateColumns: "2fr 2fr auto", gap: 1, alignItems: "center" }}>
              <TextField size="small" label="CBU o alias" value={c.cbuAlias} disabled={!puede} onChange={(e) => setCtas(ctas.map((x, j) => (j === i ? { ...x, cbuAlias: e.target.value } : x)))} />
              <TextField size="small" label="Descripción" value={c.descripcion} disabled={!puede} onChange={(e) => setCtas(ctas.map((x, j) => (j === i ? { ...x, descripcion: e.target.value } : x)))} />
              <IconButton size="small" disabled={!puede} onClick={() => setCtas(ctas.filter((_, j) => j !== i))}><DeleteOutlineIcon fontSize="small" /></IconButton>
            </Box>
          ))}
          {puede && <Box><Button size="small" variant="ghost" startIcon={<AddIcon />} onClick={() => setCtas([...ctas, { cbuAlias: "", descripcion: "" }])}>Agregar cuenta</Button></Box>}
        </Box>
      </Card>
      {puede && <Box sx={{ display: "flex", justifyContent: "flex-end" }}><Button variant="primary" loading={guardando} onClick={guardar}>Guardar percepciones y cuentas</Button></Box>}
    </Box>
  );
};

export default PercepcionesYCuentas;
