/**
 * EL FORMULARIO DEL GASTO. Los renglones se cargan como se leen del papel
 * (concepto + monto); el tilde "IVA aparte" es la factura A (renglones netos,
 * IVA copiado del pie que SE SUMA). Sin renglones vale el camino neto + IVA +
 * otros. Con "lo pagué y lo cargo", el pago sale en el mismo acto.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Autocomplete from "@mui/material/Autocomplete";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import Alert from "@mui/material/Alert";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import AddIcon from "@mui/icons-material/Add";

import Modal from "../../../components/Modal/Modal";
import Button from "../../../components/Button/Button";
import { useToast } from "../../../components/Toast/ToastContext";
import { useAuth } from "../../../context/AuthContext";
import { ventasApi } from "../../ventas/api/ventasApi";
import { comprasApi, TIPOS_DOC_GASTO, LETRAS, MEDIOS_PAGO_PROV, money, hoyISO, aDia, r2 } from "../../abastecimiento/api/comprasApi";

const desdeGasto = (g) => (g ? {
  fecha: aDia(g.fecha), tipoDoc: g.tipoDoc, letra: g.letra, numero: g.numero || "", proveedorId: g.proveedorId || "", proveedorTexto: g.proveedorTexto || "",
  categoriaId: g.categoriaId, sucursalId: g.sucursalId || "", condicionPago: g.condicionPago, vencimiento: aDia(g.vencimiento), observaciones: g.observaciones || "",
  items: (g.items || []).map((i) => ({ concepto: i.concepto, monto: String(i.monto) })), ivaAparte: (g.items || []).length > 0 && Math.abs(g.neto - g.items.reduce((a, i) => a + i.monto, 0)) < 0.01 && g.iva > 0,
  neto: String(g.neto || ""), iva: String(g.iva || ""), otros: String(r2(g.otros - g.impInternos - g.percDgi - g.percDgr) || ""), impInternos: String(g.impInternos || ""), percDgi: String(g.percDgi || ""), percDgr: String(g.percDgr || ""),
} : {
  fecha: hoyISO(), tipoDoc: "factura", letra: "B", numero: "", proveedorId: "", proveedorTexto: "", categoriaId: "", sucursalId: "", condicionPago: "contado", vencimiento: "", observaciones: "",
  items: [{ concepto: "", monto: "" }], ivaAparte: false, neto: "", iva: "", otros: "", impInternos: "", percDgi: "", percDgr: "",
});

/** Se monta al abrir: el estado nace del gasto (o vacío) cada vez. */
const GastoForm = (props) => (props.open ? <Cuerpo {...props} /> : null);

const Cuerpo = ({ onClose, gasto, boot, onListo }) => {
  const { showToast } = useToast();
  const { user, esJefe, can } = useAuth();
  const qc = useQueryClient();
  const [v, setV] = useState(() => desdeGasto(gasto));
  const [pago, setPago] = useState({ on: false, medio: "efectivo", usarCaja: true, referencia: "" });
  const caja = useQuery({ queryKey: ["pos", "caja", user?.sucursalId], queryFn: () => ventasApi.caja.actual(user.sucursalId), enabled: Boolean(user?.sucursalId) });
  const puedePagar = can("gastos_pagar", "gastos_pagar_proveedor", "ventas.caja");
  const tienePagos = Boolean(gasto) && gasto.pagado > 0.009;
  const set = (k) => (e) => setV({ ...v, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const renglones = v.items.filter((i) => i.concepto.trim() && Number(i.monto) > 0);
  const total = useMemo(() => {
    const extras = (Number(v.otros) || 0) + (Number(v.impInternos) || 0) + (Number(v.percDgi) || 0) + (Number(v.percDgr) || 0);
    if (renglones.length) {
      const suma = renglones.reduce((a, i) => a + Number(i.monto), 0);
      return r2(v.ivaAparte ? suma + (Number(v.iva) || 0) + extras : suma + extras);
    }
    return r2((Number(v.neto) || 0) + (Number(v.iva) || 0) + extras);
  }, [v, renglones]);

  const proveedor = (boot?.proveedores || []).find((p) => p.id === Number(v.proveedorId)) || null;
  const m = useMutation({
    mutationFn: (body) => (gasto ? comprasApi.gastos.editar(gasto.id, body) : comprasApi.gastos.crear(body)),
    onSuccess: (g) => { showToast(gasto ? "Gasto guardado." : `Gasto #${g.id} cargado${g.estado === "pagado" ? " y pagado" : ""}.`, "success"); qc.invalidateQueries({ queryKey: ["gastos"] }); qc.invalidateQueries({ queryKey: ["pagos"] }); qc.invalidateQueries({ queryKey: ["caja"] }); onListo?.(g); onClose(); },
    onError: (e) => showToast(e?.message || "No se pudo guardar.", "error"),
  });

  const enviar = () => {
    if (!v.categoriaId) return showToast("Elegí el rubro.", "warning");
    if (total <= 0) return showToast("El importe tiene que ser mayor a 0.", "warning");
    if (pago.on && pago.medio === "efectivo" && pago.usarCaja && !caja.data) return showToast("No hay turno de caja abierto para pagar en efectivo.", "warning");
    const body = {
      fecha: v.fecha || undefined, tipoDoc: v.tipoDoc, letra: v.letra, numero: v.numero || "", proveedorId: v.proveedorId ? Number(v.proveedorId) : null, proveedorTexto: v.proveedorId ? "" : v.proveedorTexto,
      categoriaId: Number(v.categoriaId), sucursalId: esJefe ? (v.sucursalId ? Number(v.sucursalId) : null) : undefined, condicionPago: v.condicionPago, vencimiento: v.vencimiento || null, observaciones: v.observaciones,
      ...(tienePagos ? {} : renglones.length
        ? { items: renglones.map((i) => ({ concepto: i.concepto.trim(), monto: Number(i.monto) })), ivaAparte: v.ivaAparte, iva: Number(v.iva) || 0, otros: Number(v.otros) || 0, impInternos: Number(v.impInternos) || 0, percDgi: Number(v.percDgi) || 0, percDgr: Number(v.percDgr) || 0 }
        : { neto: Number(v.neto) || 0, iva: Number(v.iva) || 0, otros: Number(v.otros) || 0, impInternos: Number(v.impInternos) || 0, percDgi: Number(v.percDgi) || 0, percDgr: Number(v.percDgr) || 0 }),
      ...(!gasto && pago.on ? { pagoInmediato: { importe: total, medio: pago.medio, referencia: pago.referencia || undefined, cajaSesionId: pago.medio === "efectivo" && pago.usarCaja ? caja.data?.id : undefined } } : {}),
    };
    m.mutate(body);
  };

  return (
    <Modal open onClose={onClose} title={gasto ? `Editar gasto #${gasto.id}` : "Nuevo gasto"} subtitle="Lo que se paga y no es mercadería: el comprobante, el rubro, y si ya se pagó." maxWidth="md"
      actions={(<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" loading={m.isPending} onClick={enviar}>{gasto ? "Guardar" : pago.on ? `Cargar y pagar ${money(total)}` : `Cargar ${money(total)}`}</Button></>)}>
      <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
        {tienePagos && <Alert severity="info">Este gasto ya tiene pagos: se pueden corregir los datos descriptivos, no los importes ni el proveedor.</Alert>}
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 2 }}>
          <TextField size="small" type="date" label="Fecha del papel" value={v.fecha} onChange={set("fecha")} disabled={tienePagos} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField select size="small" label="Comprobante" value={v.tipoDoc} onChange={set("tipoDoc")} disabled={tienePagos}>{Object.entries(TIPOS_DOC_GASTO).map(([k, l]) => <MenuItem key={k} value={k}>{l}</MenuItem>)}</TextField>
          <TextField select size="small" label="Letra" value={v.letra} onChange={set("letra")} disabled={tienePagos}>{LETRAS.map((l) => <MenuItem key={l} value={l}>{l}</MenuItem>)}</TextField>
          <TextField size="small" label="Número" value={v.numero} onChange={set("numero")} disabled={tienePagos} placeholder="0002-00013456" />
        </Box>
        <Box sx={{ display: "grid", gridTemplateColumns: "2fr 2fr", gap: 2 }}>
          <Autocomplete size="small" options={boot?.proveedores || []} getOptionLabel={(p) => p.nombre} value={proveedor} disabled={tienePagos}
            onChange={(_, p) => setV({ ...v, proveedorId: p?.id || "", proveedorTexto: p ? "" : v.proveedorTexto, letra: p?.letraGasto || v.letra })}
            renderInput={(p) => <TextField {...p} label="Proveedor (del padrón)" helperText={proveedor ? "" : "Sin proveedor no hay cuenta corriente: queda el texto."} />} />
          <TextField size="small" label="O quién, en texto" value={v.proveedorTexto} onChange={set("proveedorTexto")} disabled={Boolean(v.proveedorId) || tienePagos} placeholder="YPF, changa de Juan…" />
        </Box>
        <Box sx={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 2 }}>
          <TextField select size="small" label="Rubro" value={v.categoriaId} onChange={set("categoriaId")}>{(boot?.categorias || []).filter((c) => c.activa || c.id === v.categoriaId).map((c) => <MenuItem key={c.id} value={c.id}>{c.nombre} · {c.tipo}</MenuItem>)}</TextField>
          {esJefe ? <TextField select size="small" label="Sucursal" value={v.sucursalId} onChange={set("sucursalId")}><MenuItem value="">Toda la empresa</MenuItem>{(boot?.sucursales || []).map((s) => <MenuItem key={s.id} value={s.id}>{s.nombre}</MenuItem>)}</TextField> : <TextField size="small" label="Sucursal" value={user?.sucursalNombre || ""} disabled />}
          <TextField select size="small" label="Condición" value={v.condicionPago} onChange={set("condicionPago")} disabled={tienePagos}><MenuItem value="contado">Contado</MenuItem><MenuItem value="cuenta_corriente">Cuenta corriente</MenuItem></TextField>
          <TextField size="small" type="date" label="Vence" value={v.vencimiento} onChange={set("vencimiento")} slotProps={{ inputLabel: { shrink: true } }} />
        </Box>

        {!tienePagos && (<>
          <Box sx={{ display: "grid", gap: 1 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Typography variant="subtitle2">Renglones (como los lista el papel)</Typography>
              <FormControlLabel control={<Switch size="small" checked={v.ivaAparte} onChange={set("ivaAparte")} />} label="Factura A: los renglones son netos y el IVA se suma" />
            </Box>
            {v.items.map((it, i) => (
              <Box key={i} sx={{ display: "grid", gridTemplateColumns: "3fr 1fr auto", gap: 1 }}>
                <TextField size="small" placeholder="Concepto" value={it.concepto} onChange={(e) => setV({ ...v, items: v.items.map((x, j) => (j === i ? { ...x, concepto: e.target.value } : x)) })} autoFocus={i === 0 && !gasto} />
                <TextField size="small" type="number" placeholder={v.ivaAparte ? "Neto" : "Monto final"} value={it.monto} onChange={(e) => setV({ ...v, items: v.items.map((x, j) => (j === i ? { ...x, monto: e.target.value } : x)) })} />
                <IconButton size="small" onClick={() => setV({ ...v, items: v.items.length > 1 ? v.items.filter((_, j) => j !== i) : [{ concepto: "", monto: "" }] })}><DeleteOutlineIcon fontSize="small" /></IconButton>
              </Box>
            ))}
            <Box><Button size="small" variant="ghost" startIcon={<AddIcon />} onClick={() => setV({ ...v, items: [...v.items, { concepto: "", monto: "" }] })}>Agregar renglón</Button></Box>
          </Box>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 1 }}>
            {!renglones.length && <TextField size="small" type="number" label="Neto" value={v.neto} onChange={set("neto")} />}
            <TextField size="small" type="number" label={renglones.length && !v.ivaAparte ? "IVA incluido (info)" : "IVA"} value={v.iva} onChange={set("iva")} />
            <TextField size="small" type="number" label="Imp. internos" value={v.impInternos} onChange={set("impInternos")} />
            <TextField size="small" type="number" label="Perc. DGI" value={v.percDgi} onChange={set("percDgi")} />
            <TextField size="small" type="number" label="Perc. DGR" value={v.percDgr} onChange={set("percDgr")} />
            <TextField size="small" type="number" label="Otros" value={v.otros} onChange={set("otros")} />
          </Box>
          <Typography variant="h6" sx={{ textAlign: "right" }}>Total {money(total)}</Typography>
        </>)}

        {!gasto && puedePagar && (
          <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
            <FormControlLabel control={<Switch checked={pago.on} onChange={(e) => setPago({ ...pago, on: e.target.checked })} />} label="Lo pagué y lo cargo" />
            {pago.on && (<>
              <TextField select size="small" label="Medio" value={pago.medio} onChange={(e) => setPago({ ...pago, medio: e.target.value })} sx={{ minWidth: 160 }}>{Object.entries(MEDIOS_PAGO_PROV).map(([k, l]) => <MenuItem key={k} value={k}>{l}</MenuItem>)}</TextField>
              {pago.medio === "efectivo" && <FormControlLabel control={<Switch size="small" checked={pago.usarCaja} onChange={(e) => setPago({ ...pago, usarCaja: e.target.checked })} />} label={caja.data ? `Sale del cajón (turno #${caja.data.id})` : "Sale del cajón (sin turno)"} />}
              <TextField size="small" label="Referencia" value={pago.referencia} onChange={(e) => setPago({ ...pago, referencia: e.target.value })} />
            </>)}
          </Box>
        )}
        <TextField size="small" label="Observaciones" value={v.observaciones} onChange={set("observaciones")} multiline minRows={2} />
      </Box>
    </Modal>
  );
};

export default GastoForm;
