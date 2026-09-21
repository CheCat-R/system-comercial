/**
 * REGISTRAR UN PAGO A PROVEEDOR. Sirve para las tres puertas: la cajera que le
 * paga al repartidor (a cuenta, sale del cajón), el administrador que paga una
 * factura o un gasto (imputado en el acto) y el flete adelantado.
 *
 * Un solo medio o el split multi-forma; el efectivo pide el turno de caja
 * abierto de la sucursal. Las imputaciones salen de los documentos que el
 * proveedor todavía debe (la API rechaza lo que no cierra).
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
import Checkbox from "@mui/material/Checkbox";
import IconButton from "@mui/material/IconButton";
import Alert from "@mui/material/Alert";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import AddIcon from "@mui/icons-material/Add";

import Modal from "../../../components/Modal/Modal";
import Button from "../../../components/Button/Button";
import { useToast } from "../../../components/Toast/ToastContext";
import { useAuth } from "../../../context/AuthContext";
import { ventasApi } from "../../ventas/api/ventasApi";
import { comprasApi, MEDIOS_PAGO_PROV, money, hoyISO, r2 } from "../api/comprasApi";

/**
 * @param proveedores lista del padrón (id, nombre, proveeMercaderia, proveeGastos)
 * @param fijo { proveedorId?, destino?, doc?: {tipo:'gasto'|'comprobante', docId, etiqueta, saldo} } lo que la pantalla que abre ya decidió
 */
/** Se monta recién al abrir: el estado nace de `fijo` cada vez, sin efectos que lo sincronicen. */
const PagoProveedorModal = (props) => (props.open ? <PagoForm {...props} /> : null);

const PagoForm = ({ open, onClose, proveedores = [], fijo = {}, onListo }) => {
  const { showToast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const sucursalId = user?.sucursalId;
  const [proveedorId, setProveedorId] = useState(fijo.proveedorId || "");
  const [destino, setDestino] = useState(fijo.destino || "mercaderia");
  const [importe, setImporte] = useState(fijo.doc ? String(fijo.doc.saldo) : "");
  const [medio, setMedio] = useState("efectivo");
  const [mixto, setMixto] = useState(false);
  const [formas, setFormas] = useState([{ medio: "transferencia", importe: "" }, { medio: "efectivo", importe: "" }]);
  const [fecha, setFecha] = useState(hoyISO());
  const [concepto, setConcepto] = useState("");
  const [referencia, setReferencia] = useState("");
  const [esFlete, setEsFlete] = useState(false);
  const [usarCaja, setUsarCaja] = useState(true);
  const [aplicar, setAplicar] = useState(fijo.doc ? { [`${fijo.doc.tipo}:${fijo.doc.docId}`]: fijo.doc.saldo } : {});

  const caja = useQuery({ queryKey: ["pos", "caja", sucursalId], queryFn: () => ventasApi.caja.actual(sucursalId), enabled: open && Boolean(sucursalId) });
  const pendientes = useQuery({ queryKey: ["pagos", "pendientes", proveedorId, destino], queryFn: () => comprasApi.pagos.pendientes(proveedorId, destino), enabled: open && Boolean(proveedorId) && !fijo.doc });

  const total = r2(Number(importe) || 0);
  const sumaFormas = r2(formas.reduce((a, f) => a + (Number(f.importe) || 0), 0));
  const efectivo = mixto ? r2(formas.filter((f) => f.medio === "efectivo").reduce((a, f) => a + (Number(f.importe) || 0), 0)) : (medio === "efectivo" ? total : 0);
  const aplicado = r2(Object.values(aplicar).reduce((a, v) => a + (Number(v) || 0), 0));
  const docs = fijo.doc ? [fijo.doc] : (pendientes.data || []);
  const hayCaja = Boolean(caja.data);
  const proveedor = useMemo(() => proveedores.find((p) => p.id === Number(proveedorId)), [proveedores, proveedorId]);

  const m = useMutation({
    mutationFn: (body) => comprasApi.pagos.crear(body),
    onSuccess: (p) => { showToast(`Pago #${p.id} registrado por ${money(p.importe)}.`, "success"); qc.invalidateQueries({ queryKey: ["pagos"] }); qc.invalidateQueries({ queryKey: ["comprobantes"] }); qc.invalidateQueries({ queryKey: ["gastos"] }); qc.invalidateQueries({ queryKey: ["edoc"] }); qc.invalidateQueries({ queryKey: ["caja"] }); onListo?.(p); onClose(); },
    onError: (e) => showToast(e?.message || "No se pudo registrar el pago.", "error"),
  });

  const enviar = () => {
    if (!proveedorId && !Object.keys(aplicar).length) return showToast("Elegí el proveedor.", "warning");
    if (total <= 0) return showToast("Poné el importe.", "warning");
    if (mixto && Math.abs(sumaFormas - total) > 0.009) return showToast(`Las partes suman ${money(sumaFormas)} y el pago es ${money(total)}.`, "warning");
    if (aplicado - total > 0.009) return showToast("Estás aplicando más de lo que pagás.", "warning");
    if (efectivo > 0 && usarCaja && !hayCaja) return showToast("No hay turno de caja abierto: abrilo o registrá el pago sin caja.", "warning");
    const imputaciones = Object.entries(aplicar).filter(([, v]) => Number(v) > 0).map(([k, v]) => {
      const [tipo, id] = k.split(":");
      return tipo === "gasto" ? { gastoId: Number(id), importe: r2(v) } : { comprobanteId: Number(id), importe: r2(v) };
    });
    m.mutate({
      proveedorId: proveedorId ? Number(proveedorId) : undefined, destino, importe: total, medio: mixto ? undefined : medio,
      formas: mixto ? formas.filter((f) => Number(f.importe) > 0).map((f) => ({ medio: f.medio, importe: r2(f.importe) })) : undefined,
      fecha, concepto: concepto || undefined, referencia: referencia || undefined, esFlete, cajaSesionId: efectivo > 0 && usarCaja ? caja.data?.id : undefined,
      imputaciones: imputaciones.length ? imputaciones : undefined,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Registrar pago a proveedor" subtitle="La plata sale una vez, acá. Aplicarla a un documento no vuelve a moverla." maxWidth="md"
      actions={(<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" loading={m.isPending} onClick={enviar}>Registrar {total > 0 ? money(total) : ""}</Button></>)}>
      <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 2 }}>
          <Autocomplete size="small" options={proveedores} getOptionLabel={(p) => p.nombre} value={proveedor || null} disabled={Boolean(fijo.proveedorId)}
            onChange={(_, v) => { setProveedorId(v?.id || ""); setAplicar({}); if (v && v.proveeGastos && !v.proveeMercaderia) setDestino("gastos"); }}
            renderInput={(p) => <TextField {...p} label="Proveedor" />} />
          <TextField select size="small" label="Destino" value={destino} disabled={Boolean(fijo.destino)} onChange={(e) => { setDestino(e.target.value); setAplicar({}); if (e.target.value === "gastos") setEsFlete(false); }}>
            <MenuItem value="mercaderia">Mercadería (facturas)</MenuItem><MenuItem value="gastos">Gastos</MenuItem>
          </TextField>
          <TextField size="small" type="date" label="Fecha" value={fecha} onChange={(e) => setFecha(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        </Box>
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 2 }}>
          <TextField size="small" type="number" label="Importe" value={importe} onChange={(e) => setImporte(e.target.value)} autoFocus />
          {!mixto && <TextField select size="small" label="Medio" value={medio} onChange={(e) => setMedio(e.target.value)}>{Object.entries(MEDIOS_PAGO_PROV).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}</TextField>}
          {mixto && <Box />}
          <TextField size="small" label="Concepto" placeholder={esFlete ? "Flete de la entrega" : "pedido aceite, plomero baño…"} value={concepto} onChange={(e) => setConcepto(e.target.value)} />
        </Box>
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
          <FormControlLabel control={<Switch size="small" checked={mixto} onChange={(e) => setMixto(e.target.checked)} />} label="Pago mixto (varios medios)" />
          {destino === "mercaderia" && <FormControlLabel control={<Switch size="small" checked={esFlete} onChange={(e) => setEsFlete(e.target.checked)} />} label="Es un flete que el proveedor descuenta" />}
          {efectivo > 0 && <FormControlLabel control={<Switch size="small" checked={usarCaja} onChange={(e) => setUsarCaja(e.target.checked)} />} label={hayCaja ? `Sale del cajón (turno #${caja.data.id})` : "Sale del cajón (sin turno abierto)"} />}
          <TextField size="small" label="Referencia" placeholder="N° remito, transferencia…" value={referencia} onChange={(e) => setReferencia(e.target.value)} sx={{ minWidth: 220 }} />
        </Box>
        {mixto && (
          <Box sx={{ display: "grid", gap: 1 }}>
            {formas.map((f, i) => (
              <Box key={i} sx={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 1 }}>
                <TextField select size="small" label="Medio" value={f.medio} onChange={(e) => setFormas(formas.map((x, j) => (j === i ? { ...x, medio: e.target.value } : x)))}>{Object.entries(MEDIOS_PAGO_PROV).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}</TextField>
                <TextField size="small" type="number" label="Importe" value={f.importe} onChange={(e) => setFormas(formas.map((x, j) => (j === i ? { ...x, importe: e.target.value } : x)))} />
                <IconButton size="small" onClick={() => setFormas(formas.filter((_, j) => j !== i))} disabled={formas.length <= 1}><DeleteOutlineIcon fontSize="small" /></IconButton>
              </Box>
            ))}
            <Box><Button size="small" variant="ghost" startIcon={<AddIcon />} onClick={() => setFormas([...formas, { medio: "efectivo", importe: "" }])}>Otra parte</Button>
              <Typography component="span" variant="caption" color={Math.abs(sumaFormas - total) > 0.009 ? "error" : "text.secondary"} sx={{ ml: 2 }}>Suman {money(sumaFormas)} de {money(total)}</Typography></Box>
          </Box>
        )}
        {esFlete && !usarCaja && efectivo > 0 && <Alert severity="info">El flete se registra contra la cuenta de mercadería del proveedor y queda exento del candado "por facturas".</Alert>}
        {proveedorId && (
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Aplicar a documentos {docs.length ? `(${docs.length} con saldo)` : ""}</Typography>
            {docs.length === 0 && <Typography variant="caption" color="text.secondary">{fijo.doc ? "" : "Este proveedor no tiene documentos con saldo: el pago queda a cuenta y se aplica cuando llegue la factura."}</Typography>}
            <Box sx={{ display: "grid", gap: 0.5, maxHeight: 220, overflow: "auto" }}>
              {docs.map((d) => {
                const k = `${d.tipo}:${d.docId}`;
                const on = aplicar[k] !== undefined;
                return (
                  <Box key={k} sx={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 1, alignItems: "center" }}>
                    <Checkbox size="small" checked={on} onChange={(e) => setAplicar((a) => { const n = { ...a }; if (e.target.checked) n[k] = r2(Math.min(d.saldo, Math.max(0, total - aplicado))) || d.saldo; else delete n[k]; return n; })} />
                    <Box><strong>{d.etiqueta}</strong><Typography variant="caption" display="block" color="text.secondary">{d.detalle || ""}{d.ajuste ? ` · ajuste ${money(d.ajuste)}` : ""}</Typography></Box>
                    <Typography variant="body2" color="text.secondary">saldo {money(d.saldo)}</Typography>
                    <TextField size="small" type="number" value={on ? aplicar[k] : ""} disabled={!on} onChange={(e) => setAplicar((a) => ({ ...a, [k]: e.target.value }))} sx={{ width: 130 }} />
                  </Box>
                );
              })}
            </Box>
            {aplicado > 0 && <Typography variant="caption" color={aplicado - total > 0.009 ? "error" : "text.secondary"}>Aplicado {money(aplicado)} de {money(total)}{total - aplicado > 0.009 ? ` · ${money(total - aplicado)} queda a cuenta` : ""}</Typography>}
          </Box>
        )}
      </Box>
    </Modal>
  );
};

export default PagoProveedorModal;
