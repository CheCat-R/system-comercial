/**
 * CONFIGURACIÓN DE VENTAS: las reglas del mostrador (caja obligatoria, tope
 * de descuento, lista base, monto mayorista, medios, cuenta corriente,
 * presupuestos, lector/balanza), los DESCUENTOS CON NOMBRE y el panel de
 * FACTURACIÓN ELECTRÓNICA (estado, prueba de conexión, certificado, trabadas).
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import Grid from "@mui/material/Grid";
import AddIcon from "@mui/icons-material/Add";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import { useEstadoDesde } from "../../hooks/useEstadoDesde";
import { ventasApi, CONDICIONES_IVA, MEDIOS_PAGO, etiquetaVenta, money, stamp } from "./api/ventasApi";
import "./Ventas.css";

const REDONDEOS = [{ v: 0, l: "Sin redondeo (con centavos)" }, { v: 1, l: "Al entero ($1)" }, { v: 10, l: "A $10" }, { v: 50, l: "A $50" }, { v: 100, l: "A $100" }];

/* ------------------------------ Parámetros ------------------------------ */

const Bloque = ({ titulo, children }) => <Box className="venta-bloque"><h6>{titulo}</h6>{children}</Box>;
const Sw = ({ f, k, set, label }) => <FormControlLabel control={<Switch checked={Boolean(f[k])} onChange={set(k)} />} label={label} />;

const Parametros = ({ config, listas, modalidades, onGuardar, guardando }) => {
  const [f, setF] = useEstadoDesde(config, (c) => ({ ...c }));
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const toggle = (k, v) => setF({ ...f, [k]: (f[k] || []).includes(v) ? f[k].filter((x) => x !== v) : [...(f[k] || []), v] });
  const num = (k) => (e) => setF({ ...f, [k]: Number(e.target.value) });
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}><Bloque titulo="Mostrador">
          <Sw f={f} set={set} k="cajaObligatoria" label="Caja obligatoria para cobrar al contado" />
          <Sw f={f} set={set} k="permitirStockNegativo" label="Permitir vender sin stock (negativo)" />
          <TextField size="small" type="number" label="Tope de descuento del vendedor (%)" value={f.descuentoMaxVendedor} onChange={num("descuentoMaxVendedor")} helperText="Por encima, hace falta la llave precio_manual." />
          <Sw f={f} set={set} k="overrideListaRequiereAdmin" label="Cambiar la lista a mano pide precio_manual" />
          <TextField select size="small" label="Redondeo del precio de góndola" value={f.redondeoPrecio ?? 0} onChange={num("redondeoPrecio")}>{REDONDEOS.map((r) => <MenuItem key={r.v} value={r.v}>{r.l}</MenuItem>)}</TextField>
          <TextField size="small" label="Punto de venta de los tickets internos" value={f.puntoVenta || ""} onChange={set("puntoVenta")} helperText="5 dígitos. Distinto del de ARCA (que va en el .env por sucursal)." />
        </Bloque></Grid>
        <Grid size={{ xs: 12, md: 6 }}><Bloque titulo="Listas y precio por monto">
          <TextField select size="small" label="Lista base (el piso)" value={f.listaBaseId || 0} onChange={num("listaBaseId")}><MenuItem value={0}>La primera activa</MenuItem>{listas.map((l) => <MenuItem key={l.id} value={l.id}>{l.etiqueta}</MenuItem>)}</TextField>
          <TextField size="small" type="number" label="Monto mínimo para precio mayorista ($)" value={f.montoMinimoMayorista} onChange={num("montoMinimoMayorista")} helperText="0 = apagado. Se sugiere en la caja, nunca solo." />
          <TextField select size="small" label="Modalidad que habilita el monto" value={f.modalidadMontoId || 0} onChange={num("modalidadMontoId")}><MenuItem value={0}>—</MenuItem>{modalidades.map((m) => <MenuItem key={m.id} value={m.id}>{m.nombre}</MenuItem>)}</TextField>
          <Typography variant="caption" color="text.secondary">Medios que exige el precio por monto (vacío = cualquiera)</Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>{Object.entries(MEDIOS_PAGO).map(([k, v]) => <Chip key={k} size="small" label={v} color={(f.mediosPagoMonto || []).includes(k) ? "primary" : "default"} variant={(f.mediosPagoMonto || []).includes(k) ? "filled" : "outlined"} onClick={() => toggle("mediosPagoMonto", k)} />)}</Box>
        </Bloque></Grid>
        <Grid size={{ xs: 12, md: 6 }}><Bloque titulo="Medios de pago y facturación">
          <Typography variant="caption" color="text.secondary">Medios que ofrece la caja</Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>{Object.entries(MEDIOS_PAGO).map(([k, v]) => <Chip key={k} size="small" label={v} color={(f.mediosPago || []).includes(k) ? "primary" : "default"} variant={(f.mediosPago || []).includes(k) ? "filled" : "outlined"} onClick={() => toggle("mediosPago", k)} />)}</Box>
          <Typography variant="caption" color="text.secondary">Medios que EXIGEN factura (no pueden salir en ticket)</Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>{Object.entries(MEDIOS_PAGO).map(([k, v]) => <Chip key={k} size="small" label={v} color={(f.mediosFacturar || []).includes(k) ? "warning" : "default"} variant={(f.mediosFacturar || []).includes(k) ? "filled" : "outlined"} onClick={() => toggle("mediosFacturar", k)} />)}</Box>
          <TextField select size="small" label="Condición fiscal de la empresa" value={f.condicionIvaEmpresa || "responsable_inscripto"} onChange={set("condicionIvaEmpresa")} helperText="Define la letra: RI emite A/B; monotributo y exento emiten C.">{Object.entries(CONDICIONES_IVA).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}</TextField>
          <Sw f={f} set={set} k="arcaHabilitado" label="Facturación electrónica (pedir CAE a ARCA)" />
        </Bloque></Grid>
        <Grid size={{ xs: 12, md: 6 }}><Bloque titulo="Cuenta corriente y presupuestos">
          <Sw f={f} set={set} k="ctaCteHabilitada" label="Permitir ventas en cuenta corriente" />
          <Sw f={f} set={set} k="ctaCteBloquearSuperado" label="Bloquear si supera el límite de crédito" />
          <TextField size="small" type="number" label="Días de plazo por defecto" value={f.ctaCteDiasPlazo} onChange={num("ctaCteDiasPlazo")} />
          <TextField size="small" type="number" label="Validez del presupuesto (días)" value={f.presupuestoValidezDias} onChange={num("presupuestoValidezDias")} />
          <Sw f={f} set={set} k="presupuestoReservaStock" label="Al confirmar un presupuesto, reservar el stock" />
          <TextField size="small" type="number" label="Monto mínimo para envío en camioneta ($)" value={f.montoMinimoCamioneta} onChange={num("montoMinimoCamioneta")} />
        </Bloque></Grid>
        <Grid size={{ xs: 12, md: 6 }}><Bloque titulo="Lector y balanza">
          <Sw f={f} set={set} k="lectorHabilitado" label="Lector de códigos de barras" />
          <Sw f={f} set={set} k="balanzaHabilitada" label="Etiquetas de balanza (EAN-13 de peso variable)" />
          <TextField size="small" label="Prefijo de balanza" value={f.balanzaPrefijo || "20"} onChange={set("balanzaPrefijo")} sx={{ maxWidth: 160 }} />
          <TextField select size="small" label="La etiqueta codifica" value={f.balanzaModo || "peso"} onChange={set("balanzaModo")} sx={{ maxWidth: 220 }}><MenuItem value="peso">Peso (gramos)</MenuItem><MenuItem value="importe">Importe</MenuItem></TextField>
        </Bloque></Grid>
      </Grid>
      <Box sx={{ display: "flex", justifyContent: "flex-end" }}><Button variant="primary" loading={guardando} onClick={() => onGuardar(f)}>Guardar configuración</Button></Box>
    </Box>
  );
};

/* ------------------------------ Descuentos con nombre ------------------------------ */

const Descuentos = ({ listas, sucursales }) => {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState(null);
  const q = useQuery({ queryKey: ["pos", "descuentos"], queryFn: ventasApi.descuentos.listar });
  const err = (e) => showToast(e?.message || "No se pudo.", "error");
  const inval = () => qc.invalidateQueries({ queryKey: ["pos", "descuentos"] });
  const mGuardar = useMutation({ mutationFn: (b) => (b.id ? ventasApi.descuentos.editar(b.id, b) : ventasApi.descuentos.crear(b)), onSuccess: () => { showToast("Descuento guardado.", "success"); setForm(null); inval(); }, onError: err });
  const mBorrar = useMutation({ mutationFn: (id) => ventasApi.descuentos.borrar(id), onSuccess: () => { showToast("Descuento borrado.", "success"); setForm(null); inval(); }, onError: err });
  const columns = [
    { field: "nombre", headerName: "Descuento", renderCell: (d) => <strong>{d.nombre}</strong> },
    { field: "porcentaje", headerName: "%", align: "right" },
    { field: "listaId", headerName: "Lista", renderCell: (d) => listas.find((l) => l.id === d.listaId)?.etiqueta || `#${d.listaId}` },
    { field: "sucursalId", headerName: "Sucursal", renderCell: (d) => (d.sucursalId ? sucursales.find((s) => s.id === d.sucursalId)?.nombre : "Todas") },
    { field: "medioPago", headerName: "Exige medio", renderCell: (d) => (d.medioPago ? MEDIOS_PAGO[d.medioPago] : <span className="text-tertiary">—</span>) },
    { field: "vence", headerName: "Vence", renderCell: (d) => (d.vence ? stamp(d.vence).slice(0, 6) : <span className="text-tertiary">—</span>) },
    { field: "activo", headerName: "Estado", renderCell: (d) => <><StatusBadge tone={d.activo ? "success" : "neutral"} label={d.activo ? "Activo" : "Inactivo"} />{d.requiereAdmin && <Typography variant="caption" display="block" color="text.secondary">lo aplica un admin</Typography>}</> },
  ];
  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="body2" color="text.secondary">Autorizaciones con nombre ("Empleados", "Atención por tardanza") que la cajera elige en el ticket. Uno por lista. Los que piden admin saltean el tope del vendedor.</Typography>
        <Button variant="primary" startIcon={<AddIcon />} onClick={() => setForm({ nombre: "", porcentaje: 10, listaId: listas[0]?.id || "", sucursalId: "", medioPago: "", vence: "", requiereAdmin: false, activo: true })}>Nuevo descuento</Button>
      </Box>
      <DataTable columns={columns} data={q.data || []} loading={q.isLoading} emptyMessage="Sin descuentos con nombre." onRowClick={(d) => setForm({ ...d, sucursalId: d.sucursalId ?? "", medioPago: d.medioPago ?? "", vence: d.vence ? d.vence.slice(0, 10) : "" })} />
      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? "Editar descuento" : "Nuevo descuento"} maxWidth="xs"
        actions={(<>{form?.id && <Button variant="danger" onClick={() => mBorrar.mutate(form.id)}>Borrar</Button>}<Box sx={{ flex: 1 }} /><Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button><Button variant="primary" loading={mGuardar.isPending} onClick={() => mGuardar.mutate({ ...form, porcentaje: Number(form.porcentaje), sucursalId: form.sucursalId || null, vence: form.vence || "" })}>Guardar</Button></>)}>
        {form && (
          <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
            <TextField size="small" label="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} autoFocus />
            <TextField size="small" type="number" label="Porcentaje" value={form.porcentaje} onChange={(e) => setForm({ ...form, porcentaje: e.target.value })} />
            <TextField select size="small" label="Lista de precios" value={form.listaId} onChange={(e) => setForm({ ...form, listaId: e.target.value })}>{listas.map((l) => <MenuItem key={l.id} value={l.id}>{l.etiqueta}</MenuItem>)}</TextField>
            <TextField select size="small" label="Sucursal" value={form.sucursalId} onChange={(e) => setForm({ ...form, sucursalId: e.target.value })}><MenuItem value="">Todas</MenuItem>{sucursales.map((s) => <MenuItem key={s.id} value={s.id}>{s.nombre}</MenuItem>)}</TextField>
            <TextField select size="small" label="Exige pagar ÍNTEGRO con" value={form.medioPago} onChange={(e) => setForm({ ...form, medioPago: e.target.value })}><MenuItem value="">Cualquier medio</MenuItem>{Object.entries(MEDIOS_PAGO).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}</TextField>
            <TextField size="small" type="date" label="Vence (vale todo ese día)" value={form.vence} onChange={(e) => setForm({ ...form, vence: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
            <FormControlLabel control={<Switch checked={form.requiereAdmin} onChange={(e) => setForm({ ...form, requiereAdmin: e.target.checked })} />} label="Solo lo aplica quien puede pisar precios" />
            <FormControlLabel control={<Switch checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />} label="Activo" />
          </Box>
        )}
      </Modal>
    </Box>
  );
};

/* ------------------------------ ARCA ------------------------------ */

const PanelArca = () => {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [pedido, setPedido] = useState(null);
  const [csr, setCsr] = useState(null);
  const [crt, setCrt] = useState(null);
  const estado = useQuery({ queryKey: ["arca", "estado"], queryFn: ventasApi.arca.estado });
  const mProbar = useMutation({ mutationFn: ventasApi.arca.probar, onError: (e) => showToast(e?.message || "No se pudo probar.", "error") });
  const mPedido = useMutation({ mutationFn: (b) => ventasApi.arca.pedido(b), onSuccess: (r) => { setCsr(r); setPedido(null); qc.invalidateQueries({ queryKey: ["arca"] }); }, onError: (e) => showToast(e?.message || "No se pudo.", "error") });
  const mInstalar = useMutation({ mutationFn: (c) => ventasApi.arca.instalar(c), onSuccess: (r) => { showToast(`Certificado instalado. Vence ${stamp(r.vence)}.`, "success"); setCrt(null); qc.invalidateQueries({ queryKey: ["arca"] }); }, onError: (e) => showToast(e?.message || "No se pudo.", "error") });
  const mFacturar = useMutation({ mutationFn: (id) => ventasApi.facturar(id), onSuccess: (r) => { showToast(`Facturada: ${etiquetaVenta(r)}.`, "success"); qc.invalidateQueries({ queryKey: ["arca"] }); qc.invalidateQueries({ queryKey: ["ventas"] }); }, onError: (e) => showToast(e?.message || "No se pudo.", "error") });
  const e = estado.data;
  const d = mProbar.data;
  if (!e) return <div className="route-loading" aria-busy="true" />;
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Alert severity={e.disponible ? "success" : "warning"}>
        {e.disponible ? `Configurada contra ${e.produccion ? "PRODUCCIÓN" : "homologación"} · CUIT ${e.cuit} · punto de venta ${e.puntoVenta}.` : `No se puede facturar: ${e.motivo}`}
        <Typography variant="caption" display="block">Las cinco variables (ARCA_ENV, ARCA_CUIT, ARCA_PTO_VTA, ARCA_CERT_PATH, ARCA_KEY_PATH) van en el .env de la API. Endpoint: {e.wsfeUrl}</Typography>
      </Alert>
      {e.avisos?.map((a, i) => <Alert key={i} severity="warning">{a}</Alert>)}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}><Box className="venta-bloque">
          <h6>Certificado</h6>
          <div className="venta-kv"><span>Clave privada</span><strong>{e.clave ? `en el servidor desde ${stamp(e.clave.desde)}` : "no generada"}</strong></div>
          <div className="venta-kv"><span>Certificado .crt</span><strong>{e.certificado ? (e.certificado.ilegible ? "ilegible" : `${e.certificado.subject} · vence en ${e.certificado.diasParaVencer} días`) : "no instalado"}</strong></div>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1 }}>
            <Button size="small" variant="secondary" onClick={() => setPedido({ razonSocial: e.empresaNombre || "", alias: "checat" })}>1 · Generar clave y pedido (.csr)</Button>
            <Button size="small" variant="secondary" onClick={() => setCrt("")}>2 · Instalar el .crt de ARCA</Button>
          </Box>
          <Typography variant="caption" color="text.secondary">El pedido se sube en ARCA › Administración de certificados digitales; después se autoriza el servicio "Facturación Electrónica" para ese certificado y se asocia el punto de venta tipo Web Services.</Typography>
        </Box></Grid>
        <Grid size={{ xs: 12, md: 6 }}><Box className="venta-bloque">
          <h6>Puntos de venta por sucursal</h6>
          {e.sucursales.map((s) => <div key={s.id} className="venta-kv"><span>{s.nombre} <small className="text-tertiary">{s.direccion}</small></span><strong>{s.puntoVenta || <span className="text-tertiary">usa el del .env</span>}</strong></div>)}
          {e.sinPuntoVenta > 0 && e.sucursales.length > 1 && <Typography variant="caption" color="warning.main">{e.sinPuntoVenta} sucursal(es) facturarían por la boca de expendio de otra. Cargá su punto de venta en Inventario › Sucursales.</Typography>}
        </Box></Grid>
      </Grid>
      <Box className="venta-bloque">
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h6>Probar la conexión</h6><Button size="small" variant="primary" loading={mProbar.isPending} onClick={() => mProbar.mutate()}>Probar contra ARCA</Button></Box>
        {d && (<>
          <Alert severity={d.pasos.every((p) => p.ok) ? "success" : "error"}>{d.veredicto} <small>({d.ms} ms)</small></Alert>
          {d.pasos.map((p) => <div key={p.clave} className="venta-kv"><span>{p.ok ? "✓" : "✗"} {p.titulo}</span><span className="text-tertiary">{p.detalle}</span></div>)}
          {d.numeracion?.map((n) => <div key={n.puntoVenta} className="venta-kv"><span>{n.sucursal} · PV {n.puntoVenta}</span><span className="text-tertiary">{n.tipos.map((t) => `${t.tipo}: ${t.error ? "error" : `último ${t.ultimo}`}`).join(" · ")}</span></div>)}
        </>)}
      </Box>
      <Box className="venta-bloque">
        <h6>Ventas sin facturar ({e.trabadas.cantidad} · {money(e.trabadas.plata)})</h6>
        {e.trabadas.cantidad === 0 && <Typography variant="body2" color="text.secondary">Ninguna. Esta lista tiene que estar VACÍA antes de pasar a producción.</Typography>}
        {e.trabadas.filas.map((v) => <div key={v.id} className="venta-kv"><span>{etiquetaVenta(v)} · {v.clienteNombre} · {stamp(v.fecha)}<small className="text-tertiary"> — {v.motivo}</small></span><span><strong>{money(v.total)}</strong> <Button size="small" variant="ghost" onClick={() => mFacturar.mutate(v.id)}>Facturar</Button></span></div>)}
        {e.trabadas.ocultas > 0 && <Typography variant="caption" color="text.secondary">…y {e.trabadas.ocultas} más en Ventas › Sin facturar.</Typography>}
      </Box>

      <Modal open={Boolean(pedido)} onClose={() => setPedido(null)} title="Generar la clave y el pedido de certificado" subtitle="La clave privada se escribe en el servidor y nunca sale. Lo que se descarga es el .csr, que se sube a ARCA." maxWidth="xs"
        actions={(<><Button variant="ghost" onClick={() => setPedido(null)}>Cancelar</Button><Button variant="primary" loading={mPedido.isPending} onClick={() => mPedido.mutate(pedido)}>Generar</Button></>)}>
        {pedido && <Box sx={{ display: "grid", gap: 2, pt: 1 }}><TextField size="small" label="Razón social (como figura en ARCA)" value={pedido.razonSocial} onChange={(ev) => setPedido({ ...pedido, razonSocial: ev.target.value })} /><TextField size="small" label="Alias del certificado" value={pedido.alias} onChange={(ev) => setPedido({ ...pedido, alias: ev.target.value })} /></Box>}
      </Modal>
      <Modal open={Boolean(csr)} onClose={() => setCsr(null)} title="Pedido de certificado (.csr)" subtitle={csr ? `${csr.subject}${csr.claveNueva ? " · clave nueva generada" : " · se reusó la clave existente"}` : ""} maxWidth="sm"
        actions={(<><Button variant="ghost" onClick={() => { navigator.clipboard?.writeText(csr.csr); showToast("Copiado.", "success"); }}>Copiar</Button><Button variant="primary" onClick={() => setCsr(null)}>Listo</Button></>)}>
        {csr && <TextField fullWidth multiline minRows={10} value={csr.csr} slotProps={{ input: { readOnly: true, sx: { fontFamily: "var(--font-mono)", fontSize: 11 } } }} sx={{ mt: 1 }} />}
      </Modal>
      <Modal open={crt !== null} onClose={() => setCrt(null)} title="Instalar el certificado" subtitle="Pegá el .crt que devolvió ARCA, con las líneas BEGIN/END incluidas. Se verifica que sea de esta clave, de este CUIT y que esté vigente." maxWidth="sm"
        actions={(<><Button variant="ghost" onClick={() => setCrt(null)}>Cancelar</Button><Button variant="primary" loading={mInstalar.isPending} disabled={!crt?.includes("BEGIN CERTIFICATE")} onClick={() => mInstalar.mutate(crt)}>Instalar</Button></>)}>
        <TextField fullWidth multiline minRows={10} value={crt || ""} onChange={(ev) => setCrt(ev.target.value)} placeholder="-----BEGIN CERTIFICATE-----" slotProps={{ input: { sx: { fontFamily: "var(--font-mono)", fontSize: 11 } } }} sx={{ mt: 1 }} />
      </Modal>
    </Box>
  );
};

/* ------------------------------ Pantalla ------------------------------ */

const ConfiguracionVentas = () => {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState(() => (window.location.hash === "#arca" ? 2 : 0));
  const config = useQuery({ queryKey: ["configuracion", "ventas"], queryFn: ventasApi.configuracion });
  const boot = useQuery({ queryKey: ["ventas", "bootstrap"], queryFn: ventasApi.bootstrap, staleTime: 60_000 });
  const mGuardar = useMutation({ mutationFn: (f) => ventasApi.guardarConfiguracion(f), onSuccess: () => { showToast("Configuración guardada.", "success"); qc.invalidateQueries({ queryKey: ["configuracion", "ventas"] }); qc.invalidateQueries({ queryKey: ["ventas", "bootstrap"] }); qc.invalidateQueries({ queryKey: ["pos"] }); }, onError: (e) => showToast(e?.message || "No se pudo guardar.", "error") });
  const listas = boot.data?.listasCatalogo?.listas || [];
  const modalidades = boot.data?.listasCatalogo?.modalidades || [];
  const sucursales = boot.data?.sucursales || [];

  return (
    <Box className="page fade-in">
      <PageHeader title="Configuración de ventas" subtitle="Las reglas del mostrador, los descuentos autorizados y la facturación electrónica." />
      <Box className="table-tabs" sx={{ mb: 2 }}><Tabs value={tab} onChange={(_, v) => setTab(v)}><Tab label="Parámetros" /><Tab label="Descuentos con nombre" /><Tab label="Facturación electrónica (ARCA)" /></Tabs></Box>
      {tab === 0 && (config.data ? <Parametros config={config.data} listas={listas} modalidades={modalidades} onGuardar={(f) => mGuardar.mutate(f)} guardando={mGuardar.isPending} /> : <div className="route-loading" aria-busy="true" />)}
      {tab === 1 && <Descuentos listas={listas} sucursales={sucursales} />}
      {tab === 2 && <PanelArca />}
    </Box>
  );
};

export default ConfiguracionVentas;
