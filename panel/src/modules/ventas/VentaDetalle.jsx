/**
 * Una venta: renglones, pagos, notas de crédito y lo que se puede hacer con
 * ella — imprimir, facturar (si quedó provisoria), anular (ticket sin CAE) o
 * emitir una nota de crédito (factura), total o parcial.
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Alert from "@mui/material/Alert";
import Tooltip from "@mui/material/Tooltip";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";

import EntityHeader from "../../components/EntityHeader/EntityHeader";
import Button from "../../components/Button/Button";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { useEntityLabel } from "../../components/Breadcrumbs/EntityLabelContext";
import { httpClient } from "../../app/api/httpClient";
import { ventasApi, CONDICIONES_IVA, ESTADOS_VENTA, MEDIOS_PAGO, ORIGEN_LISTA, esNotaCredito, etiquetaVenta, money, num, stamp } from "./api/ventasApi";
import { imprimirVenta } from "./components/imprimirVenta";
import "./Ventas.css";

const VentaDetalle = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { can } = useAuth();
  const qc = useQueryClient();
  const { setLabel } = useEntityLabel();
  const [anular, setAnular] = useState(null);
  const [nc, setNc] = useState(null); // { motivo, parcial, cantidades, devuelveMercaderia, devolverEfectivo }

  const q = useQuery({ queryKey: ["venta", id], queryFn: () => ventasApi.venta(id) });
  const empresa = useQuery({ queryKey: ["configuracion", "empresa"], queryFn: () => httpClient.get("/configuracion/empresa"), staleTime: 10 * 60_000 });
  const v = q.data;
  useEffect(() => { if (v) setLabel(id, etiquetaVenta(v)); }, [id, v, setLabel]);

  const invalidar = () => { qc.invalidateQueries({ queryKey: ["venta", id] }); qc.invalidateQueries({ queryKey: ["ventas"] }); qc.invalidateQueries({ queryKey: ["pos"] }); };
  const err = (e) => showToast(e?.message || "No se pudo.", "error");
  const mAnular = useMutation({ mutationFn: (motivo) => ventasApi.anular(id, motivo), onSuccess: () => { showToast("Venta anulada: la mercadería volvió al stock.", "success"); setAnular(null); invalidar(); }, onError: err });
  const mFacturar = useMutation({ mutationFn: () => ventasApi.facturar(id), onSuccess: (r) => { showToast(`Facturada: ${etiquetaVenta(r)}.`, "success"); invalidar(); }, onError: err });
  const mNc = useMutation({
    mutationFn: (body) => ventasApi.notaCredito(id, body),
    onSuccess: (r) => { showToast(`${etiquetaVenta(r)} emitida por ${money(r.total)}.`, "success"); setNc(null); invalidar(); navigate(`/ventas/${r.id}`); },
    onError: err,
  });

  if (q.isLoading) return <div className="route-loading" aria-busy="true" />;
  if (!v) return <Box className="page"><Typography>Venta inexistente.</Typography></Box>;

  const esNc = esNotaCredito(v.tipo);
  const confirmada = v.estado === "confirmada";
  const puedeAnular = confirmada && !v.cae && !esNc && can("devoluciones") && v.cobrado <= 0.009;
  const puedeNc = confirmada && v.tipo !== "ticket" && !esNc && can("nota_credito") && v.acreditable > 0.009;
  const puedeFacturar = confirmada && v.facturarPendiente && !esNc && can("ventas.listado", "ventas.configuracion");
  const cli = v.cliente || {};

  const abrirNc = () => setNc({ motivo: "", parcial: false, cantidades: Object.fromEntries(v.items.map((it) => [it.id, it.devolvible])), devuelveMercaderia: true, devolverEfectivo: false });
  const emitirNc = () => {
    const items = nc.parcial ? Object.entries(nc.cantidades).filter(([, c]) => Number(c) > 0).map(([itemId, cantidad]) => ({ itemId: Number(itemId), cantidad: Number(cantidad) })) : undefined;
    if (nc.parcial && !items?.length) { showToast("Elegí al menos un renglón para devolver.", "error"); return; }
    mNc.mutate({ motivo: nc.motivo, items, devuelveMercaderia: nc.devuelveMercaderia, devolverEfectivo: nc.devolverEfectivo });
  };

  return (
    <Box className="page fade-in">
      <EntityHeader
        eyebrow={`${v.sucursalNombre} · ${v.cajeroNombre}${v.cobradoPorNombre ? ` · cobró ${v.cobradoPorNombre}` : ""}`}
        title={etiquetaVenta(v)}
        subtitle={`${stamp(v.fecha)} · ${v.clienteNombre}${v.condicionPago === "cuenta_corriente" ? " · cuenta corriente" : ""}${v.origen ? ` · ajusta ${etiquetaVenta(v.origen)}` : ""}`}
        badges={<><StatusBadge tone={ESTADOS_VENTA[v.estado]?.tone} label={ESTADOS_VENTA[v.estado]?.label} />{v.cae && <StatusBadge tone="success" label={`CAE ${v.cae}`} showDot={false} />}{v.facturarPendiente && v.estado !== "anulada" && <StatusBadge tone="warning" label="Sin facturar" />}</>}
        onBack={() => navigate("/ventas")}
        actions={(<>
          <Button size="small" variant="ghost" startIcon={<PrintOutlinedIcon />} onClick={() => imprimirVenta(v, empresa.data)}>Imprimir</Button>
          {puedeFacturar && <Button size="small" variant="secondary" loading={mFacturar.isPending} onClick={() => mFacturar.mutate()}>Facturar ahora</Button>}
          {confirmada && v.tipo !== "ticket" && !esNc && <Tooltip title={puedeNc ? "" : (v.acreditable <= 0.009 ? "Ya se acreditó todo." : "Pide la llave nota_credito.")}><span><Button size="small" variant="secondary" disabled={!puedeNc} onClick={abrirNc}>Nota de crédito</Button></span></Tooltip>}
          {confirmada && !esNc && v.tipo === "ticket" && <Tooltip title={puedeAnular ? "" : (v.cobrado > 0.009 ? "Tiene cobranzas imputadas: anulá primero el recibo." : "Pide la llave devoluciones.")}><span><Button size="small" variant="danger" disabled={!puedeAnular} onClick={() => setAnular("")}>Anular</Button></span></Tooltip>}
        </>)}
      />

      {v.estado === "anulada" && <Alert severity="error" sx={{ mb: 2 }}>Anulada {stamp(v.anuladoEn)}: {v.anuladoMotivo}</Alert>}
      {v.facturarPendiente && v.estado !== "anulada" && <Alert severity="warning" sx={{ mb: 2 }}>Salió como ticket provisorio: {v.facturarMotivo}. Cuando ARCA responda, «Facturar ahora» emite el comprobante fiscal sin tocar plata ni stock.</Alert>}

      <Box className="venta-detalle">
        <Box sx={{ display: "grid", gap: 2 }}>
          <Box className="venta-bloque" sx={{ p: "0 !important" }}>
            <table className="venta-tabla">
              <thead><tr><th>Artículo</th><th className="r">Cant.</th><th>Lista</th><th className="r">Precio</th><th className="r">Desc.</th><th className="r">Subtotal</th>{!esNc && confirmada && <th className="r">Devuelto</th>}</tr></thead>
              <tbody>
                {v.items.map((it) => (
                  <tr key={it.id}>
                    <td><strong>{it.nombre}</strong>{it.oferta && <Typography variant="caption" display="block" color="secondary.main">{it.oferta} · −{money(it.ofertaDescuento)}</Typography>}{it.descuentoNombre && <Typography variant="caption" display="block" color="text.secondary">{it.descuentoNombre}</Typography>}</td>
                    <td className="r">{num(it.cantidad, 3)} {it.unidad}</td>
                    <td><span className="text-tertiary">{it.lista}</span> <StatusBadge tone={ORIGEN_LISTA[it.listaOrigen]?.tone} label={ORIGEN_LISTA[it.listaOrigen]?.corto || it.listaOrigen} showDot={false} /></td>
                    <td className="r">{money(it.precioUnitario)}<Typography variant="caption" display="block" color="text.secondary">IVA {it.iva}%</Typography></td>
                    <td className="r">{it.descuento > 0 ? `${num(it.descuento)}%` : "—"}</td>
                    <td className="r"><strong>{money(it.subtotal)}</strong></td>
                    {!esNc && confirmada && <td className="r">{it.devuelto > 0 ? <span className="ventas-num--neg">{num(it.devuelto, 3)}</span> : "—"}</td>}
                  </tr>
                ))}
                {v.extras.map((e) => <tr key={`e${e.id}`}><td colSpan={5}><span className="text-tertiary">{e.concepto} · IVA {e.iva}%</span></td><td className="r">{money(e.importe)}</td>{!esNc && confirmada && <td />}</tr>)}
              </tbody>
            </table>
          </Box>
          {v.notas?.length > 0 && (
            <Box className="venta-bloque">
              <h6>Notas de crédito de esta venta</h6>
              {v.notas.map((n) => <div key={n.id} className="venta-kv"><span><a href={`/ventas/${n.id}`} onClick={(e) => { e.preventDefault(); navigate(`/ventas/${n.id}`); }}>{etiquetaVenta(n)}</a> · {stamp(n.fecha)}{n.cae ? ` · CAE ${n.cae}` : n.facturarPendiente ? " · sin CAE" : ""}</span><strong>−{money(n.total)}</strong></div>)}
            </Box>
          )}
          {v.observaciones && <Box className="venta-bloque"><h6>Observaciones</h6><div className="venta-obs">{v.observaciones}</div></Box>}
        </Box>

        <Box sx={{ display: "grid", gap: 2 }}>
          <Box className="venta-bloque">
            <h6>Totales</h6>
            <div className="venta-kv"><span>Neto</span><strong>{money(v.subtotalNeto)}</strong></div>
            {v.descuentoTotal > 0 && <div className="venta-kv"><span>Descuentos</span><strong>−{money(v.descuentoTotal)}</strong></div>}
            <div className="venta-kv"><span>IVA</span><strong>{money(v.ivaTotal)}</strong></div>
            <div className="venta-kv venta-kv--total"><span>Total</span><strong>{money(v.total)}</strong></div>
            {!esNc && (<>
              {v.cobrado > 0 && <div className="venta-kv"><span>Cobrado con recibos</span><strong>{money(v.cobrado)}</strong></div>}
              {v.acreditado > 0 && <div className="venta-kv"><span>Acreditado por NC</span><strong>−{money(v.acreditado)}</strong></div>}
              {v.saldo > 0.009 && <div className="venta-kv"><span>Saldo pendiente</span><strong className="ventas-num--saldo">{money(v.saldo)}</strong></div>}
            </>)}
          </Box>
          <Box className="venta-bloque">
            <h6>Pago</h6>
            {v.condicionPago === "cuenta_corriente" ? <Typography variant="body2">Cuenta corriente{v.vencimientoPago ? ` · vence ${stamp(v.vencimientoPago)}` : ""}</Typography>
              : v.pagos.length ? v.pagos.map((p) => <div key={p.id} className="venta-kv"><span>{MEDIOS_PAGO[p.medio] || p.medio}{p.referencia ? ` · ${p.referencia}` : ""}</span><strong>{money(p.importe)}</strong></div>) : <Typography variant="body2" color="text.secondary">Sin pagos registrados.</Typography>}
            {v.cajaSesionId && <Typography variant="caption" color="text.secondary">Turno de caja #{v.cajaSesionId}</Typography>}
          </Box>
          <Box className="venta-bloque">
            <h6>Cliente</h6>
            <Typography variant="body2"><strong>{cli.nombre || v.clienteNombre}</strong></Typography>
            <Typography variant="caption" color="text.secondary">{CONDICIONES_IVA[cli.condicionIva]?.label || ""}{cli.numeroDoc ? ` · ${(cli.tipoDoc || "").toUpperCase()} ${cli.numeroDoc}` : ""}{cli.direccion ? ` · ${cli.direccion}` : ""}</Typography>
            {v.clienteId && <Button size="small" variant="ghost" onClick={() => navigate(`/clientes/${v.clienteId}`)}>Ver ficha</Button>}
          </Box>
        </Box>
      </Box>

      <Modal open={anular !== null} onClose={() => setAnular(null)} title="Anular la venta" subtitle="Devuelve la mercadería al stock y saca la venta del arqueo del turno. Queda registrado quién, cuándo y por qué." maxWidth="xs"
        actions={(<><Button variant="ghost" onClick={() => setAnular(null)}>Cancelar</Button><Button variant="danger-solid" loading={mAnular.isPending} disabled={!anular?.trim()} onClick={() => mAnular.mutate(anular)}>Anular</Button></>)}>
        <TextField fullWidth size="small" label="Motivo" value={anular || ""} onChange={(e) => setAnular(e.target.value)} sx={{ mt: 1 }} autoFocus multiline minRows={2} />
      </Modal>

      <Modal open={Boolean(nc)} onClose={() => setNc(null)} title="Nota de crédito" subtitle={`Quedan ${money(v.acreditable)} por acreditar. Total = todo lo que queda; parcial = elegís renglones.`} maxWidth="sm"
        actions={(<><Button variant="ghost" onClick={() => setNc(null)}>Cancelar</Button><Button variant="primary" loading={mNc.isPending} disabled={!nc?.motivo?.trim()} onClick={emitirNc}>Emitir</Button></>)}>
        {nc && (
          <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
            <TextField size="small" label="Motivo" value={nc.motivo} onChange={(e) => setNc({ ...nc, motivo: e.target.value })} autoFocus />
            <FormControlLabel control={<Checkbox checked={nc.parcial} onChange={(e) => setNc({ ...nc, parcial: e.target.checked })} />} label="Parcial: elegir qué se devuelve" />
            {nc.parcial && (
              <Box sx={{ display: "grid", gap: 1 }}>
                {v.items.filter((it) => it.devolvible > 0).map((it) => (
                  <Box key={it.id} sx={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 1, alignItems: "center" }}>
                    <span>{it.nombre} <small className="text-tertiary">(hasta {num(it.devolvible, 3)})</small></span>
                    <TextField size="small" type="number" value={nc.cantidades[it.id]} onChange={(e) => setNc({ ...nc, cantidades: { ...nc.cantidades, [it.id]: Math.min(it.devolvible, Math.max(0, Number(e.target.value) || 0)) } })} />
                  </Box>
                ))}
              </Box>
            )}
            <FormControlLabel control={<Checkbox checked={nc.devuelveMercaderia} onChange={(e) => setNc({ ...nc, devuelveMercaderia: e.target.checked })} />} label="La mercadería vuelve al depósito" />
            <FormControlLabel control={<Checkbox checked={nc.devolverEfectivo} onChange={(e) => setNc({ ...nc, devolverEfectivo: e.target.checked })} />} label="Devolver el efectivo desde la caja abierta" />
            {!v.cae && <Alert severity="info">La factura original no tiene CAE: la nota sale con numeración local y queda pendiente de ARCA.</Alert>}
          </Box>
        )}
      </Modal>
    </Box>
  );
};

export default VentaDetalle;
