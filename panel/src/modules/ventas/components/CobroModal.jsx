/**
 * EL COBRO. Medios de pago (varios a la vez), condición (contado / cuenta
 * corriente), cómo se cierra (ticket o factura), el redondeo hacia arriba
 * para el vuelto, el relevo de caja y el vuelto calculado. Cobrar confirma
 * el borrador ya guardado: la API valida todo de nuevo del lado que manda.
 */
import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import IconButton from "@mui/material/IconButton";
import Alert from "@mui/material/Alert";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import AddIcon from "@mui/icons-material/Add";

import Modal from "../../../components/Modal/Modal";
import Button from "../../../components/Button/Button";
import { useToast } from "../../../components/Toast/ToastContext";
import { ventasApi, MEDIOS_PAGO, money } from "../api/ventasApi";
import { r2 } from "../domain/pos";

const CobroModal = ({ open, onClose, ventaId, totales, cliente, config, usuarios = [], cajaSesionId, onCobrado }) => {
  const { showToast } = useToast();
  const medios = useMemo(() => (config?.mediosPago?.length ? config.mediosPago : Object.keys(MEDIOS_PAGO)), [config]);
  const [condicion, setCondicion] = useState("contado");
  const [tipo, setTipo] = useState("ticket");
  const [redondeo, setRedondeo] = useState(0);
  const [pagos, setPagos] = useState([{ medio: "efectivo", importe: "", referencia: "" }]);
  const [operadorId, setOperadorId] = useState("");
  const [cobrando, setCobrando] = useState(false);

  const total = r2((totales?.total || 0) + (Number(redondeo) || 0));
  const pagado = r2(pagos.reduce((a, p) => a + (Number(p.importe) || 0), 0));
  const falta = r2(total - pagado);
  // El vuelto sale del efectivo: lo que entra por tarjeta no se devuelve.
  const efectivo = r2(pagos.filter((p) => p.medio === "efectivo").reduce((a, p) => a + (Number(p.importe) || 0), 0));
  const vuelto = falta < -0.009 ? r2(Math.min(efectivo, -falta)) : 0;
  const ctaCte = condicion === "cuenta_corriente";
  const puedeCtaCte = Boolean(config?.ctaCteHabilitada) && Boolean(cliente?.ctaCteHabilitada);
  const relevos = usuarios.filter((u) => u.relevoCaja && u.activo);
  const mediosQueExigenFactura = config?.mediosFacturar ?? [];
  const exigeFactura = tipo === "ticket" && pagos.some((p) => (Number(p.importe) || 0) > 0 && mediosQueExigenFactura.includes(p.medio));

  const setPago = (i, patch) => setPagos(pagos.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const completar = (i) => setPago(i, { importe: String(r2((Number(pagos[i].importe) || 0) + Math.max(falta, 0))) });

  const cobrar = async () => {
    if (!ctaCte && Math.abs(falta) > 0.009 && falta > 0) { showToast(`Faltan ${money(falta)} para cubrir el total.`, "error"); return; }
    if (exigeFactura) { showToast("Un medio usado exige factura: cerrá como factura o cambiá el medio.", "error"); return; }
    setCobrando(true);
    try {
      // Con vuelto, el efectivo que se registra es el que QUEDA en la caja.
      const pagosApi = ctaCte ? [] : pagos.filter((p) => (Number(p.importe) || 0) > 0).map((p) => ({ ...p, importe: Number(p.importe) }));
      if (vuelto > 0) {
        const idx = pagosApi.findIndex((p) => p.medio === "efectivo");
        pagosApi[idx] = { ...pagosApi[idx], importe: r2(pagosApi[idx].importe - vuelto) };
      }
      const venta = await ventasApi.confirmar(ventaId, {
        tipo, condicionPago: condicion, cajaSesionId: cajaSesionId ?? undefined, redondeo: Number(redondeo) > 0 ? Number(redondeo) : undefined,
        operadorId: operadorId ? Number(operadorId) : undefined, pagos: pagosApi,
      });
      onCobrado?.(venta, vuelto);
    } catch (e) {
      showToast(e?.message || "No se pudo cobrar.", "error");
    } finally {
      setCobrando(false);
    }
  };

  return (
    <Modal open={open} onClose={cobrando ? undefined : onClose} title="Cobrar" subtitle={cliente ? `${cliente.nombre}${cliente.esConsumidorFinal ? "" : ` · ${cliente.condicionIva?.replace("_", " ") || ""}`}` : ""} maxWidth="sm"
      actions={(<>
        <Button variant="ghost" onClick={onClose} disabled={cobrando}>Cancelar</Button>
        <Button variant="primary" loading={cobrando} onClick={cobrar} disabled={!ctaCte && falta > 0.009}>{ctaCte ? "Confirmar en cuenta corriente" : `Cobrar ${money(total)}`}</Button>
      </>)}>
      <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
        <Box className="pos-cobro-total">
          <span>Total a cobrar</span>
          <strong>{money(total)}</strong>
          {Number(redondeo) > 0 && <small>incluye redondeo de {money(redondeo)}</small>}
        </Box>

        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">Condición</Typography>
            <ToggleButtonGroup exclusive fullWidth size="small" value={condicion} onChange={(_, v) => v && setCondicion(v)}>
              <ToggleButton value="contado">Contado</ToggleButton>
              <ToggleButton value="cuenta_corriente" disabled={!puedeCtaCte}>Cta. cte.</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Comprobante</Typography>
            <ToggleButtonGroup exclusive fullWidth size="small" value={tipo} onChange={(_, v) => v && setTipo(v)}>
              <ToggleButton value="ticket">Ticket</ToggleButton>
              <ToggleButton value="factura">Factura</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Box>
        {tipo === "factura" && !config?.arcaHabilitado && <Alert severity="info">La facturación electrónica está apagada: la factura sale con numeración local y sin CAE.</Alert>}
        {!puedeCtaCte && cliente && !cliente.esConsumidorFinal && !cliente.ctaCteHabilitada && <Typography variant="caption" color="text.secondary">Este cliente no tiene cuenta corriente habilitada.</Typography>}

        {!ctaCte && (
          <>
            <Box sx={{ display: "grid", gap: 1 }}>
              {pagos.map((p, i) => (
                <Box key={i} sx={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr auto", gap: 1, alignItems: "center" }}>
                  <TextField select size="small" label="Medio" value={p.medio} onChange={(e) => setPago(i, { medio: e.target.value })}>
                    {medios.map((m) => <MenuItem key={m} value={m}>{MEDIOS_PAGO[m] || m}</MenuItem>)}
                  </TextField>
                  <TextField size="small" label="Importe" type="number" value={p.importe} onChange={(e) => setPago(i, { importe: e.target.value })} onFocus={(e) => e.target.select()} autoFocus={i === 0}
                    slotProps={{ input: { endAdornment: falta > 0.009 ? <Button size="small" variant="ghost" onClick={() => completar(i)}>resto</Button> : null } }} />
                  <TextField size="small" label="Referencia" value={p.referencia} onChange={(e) => setPago(i, { referencia: e.target.value })} placeholder={p.medio === "efectivo" ? "" : "Nº op., cupón…"} />
                  <IconButton size="small" onClick={() => setPagos(pagos.filter((_, j) => j !== i))} disabled={pagos.length === 1} aria-label="Quitar"><DeleteOutlineIcon fontSize="small" /></IconButton>
                </Box>
              ))}
              <Box><Button size="small" variant="ghost" startIcon={<AddIcon />} onClick={() => setPagos([...pagos, { medio: medios.find((m) => m !== pagos[0].medio) || "efectivo", importe: "", referencia: "" }])}>Otro medio</Button></Box>
            </Box>
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, alignItems: "center" }}>
              <TextField size="small" type="number" label="Redondeo para el vuelto (hasta $100)" value={redondeo} onChange={(e) => setRedondeo(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} helperText={`${money(totales?.total || 0)} → ${money(total)}`} />
              <Box className={`pos-cobro-vuelto ${falta > 0.009 ? "pos-cobro-vuelto--falta" : ""}`}>
                {falta > 0.009 ? <><span>Falta</span><strong>{money(falta)}</strong></> : <><span>Vuelto</span><strong>{money(vuelto)}</strong></>}
              </Box>
            </Box>
            {exigeFactura && <Alert severity="warning">Un medio usado exige factura: cerrá como factura o cambiá el medio.</Alert>}
          </>
        )}
        {ctaCte && <Alert severity="info">Sin pagos ahora: la venta queda en la cuenta del cliente y se cobra con un recibo.</Alert>}

        {relevos.length > 0 && (
          <TextField select size="small" label="Quién cobra (relevo de caja)" value={operadorId} onChange={(e) => setOperadorId(e.target.value)} helperText="Dejalo vacío si cobrás vos.">
            <MenuItem value="">Yo</MenuItem>
            {relevos.map((u) => <MenuItem key={u.id} value={u.id}>{u.nombre}</MenuItem>)}
          </TextField>
        )}
      </Box>
    </Modal>
  );
};

export default CobroModal;
