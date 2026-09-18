/**
 * Operaciones de almacén, contra la API: movimientos manuales (devolución,
 * ajuste, merma, vencido, defectuoso), fraccionar granel en paquetes,
 * corregir una tanda mal cargada, e incidencias (mercadería apartada hasta
 * que alguien decida qué pasó con ella).
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Autocomplete from "@mui/material/Autocomplete";
import Tooltip from "@mui/material/Tooltip";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { QK } from "../../app/api/queryClient";
import { inventarioApi, num, fmtTam, formaDe, stamp } from "./api/inventarioApi";
import { useInventarioBase } from "./hooks/useInventario";
import "./Ajustes.css";

const TIPOS_MANUALES = {
  devolucion: { label: "Devolución (entra)", llave: "inventario", signo: 1 },
  ajuste: { label: "Ajuste de inventario (±)", llave: "inventario", signo: 0 },
  merma: { label: "Merma (sale, con costo)", llave: "merma", signo: -1 },
  vencido: { label: "Vencido (sale a vencido)", llave: "merma", signo: -1 },
  defectuoso: { label: "Defectuoso (sale a defectuoso)", llave: "defectuoso", signo: -1 },
};
const TIPOS_INCIDENCIA = ["faltante", "rotura", "vencimiento", "diferencia", "otro"];
const RESOLUCIONES = { liberar: "Liberar a disponible", merma: "Baja por merma", vencido: "Baja por vencido", defectuoso: "Baja por defectuoso" };

/** Selector de producto + forma (suelto o paquete). */
const ProductoForma = ({ productos, value, onChange, soloGranel = false }) => {
  const opciones = (productos || []).filter((p) => p.estado !== "archivado" && (!soloGranel || p.tipo === "granel"));
  const p = opciones.find((x) => x.id === value.productoId) || null;
  return (
    <>
      <Autocomplete size="small" options={opciones} value={p} getOptionLabel={(o) => `${o.nombre} · ${o.codigoPropio}`} onChange={(_, v) => onChange({ productoId: v?.id ?? null, presId: null })}
        renderInput={(params) => <TextField {...params} label="Producto" />} />
      {p && !soloGranel && (p.presentaciones || []).length > 0 && (
        <TextField select size="small" label="Forma" value={value.presId ?? ""} onChange={(e) => onChange({ ...value, presId: e.target.value || null })}>
          <MenuItem value="">{p.tipo === "granel" ? "Granel suelto (kg)" : "Unidad"}</MenuItem>
          {p.presentaciones.map((pr) => <MenuItem key={pr.id} value={pr.id}>Paquete {fmtTam(pr.tamKg)}</MenuItem>)}
        </TextField>
      )}
    </>
  );
};

const Ajustes = () => {
  const { showToast } = useToast();
  const { user, esJefe, can, check } = useAuth();
  const qc = useQueryClient();
  const { productos, sucursales, productoDe, sucursalDe, cantidad } = useInventarioBase();
  const [tab, setTab] = useState(0);

  const sucursalDefault = user?.sucursalId ?? "";
  const [mov, setMov] = useState({ tipo: "devolucion", productoId: null, presId: null, sucursalId: sucursalDefault, cantidad: "", signo: 1, motivo: "" });
  const [frac, setFrac] = useState({ productoId: null, sucursalId: sucursalDefault, asignaciones: {} });
  const [corr, setCorr] = useState({ productoId: null, presId: "", sucursalId: sucursalDefault, cantidadReal: "", motivo: "" });
  const [inc, setInc] = useState({ productoId: null, presId: null, sucursalId: sucursalDefault, tipo: "faltante", cantidad: "", motivo: "" });
  const [resolver, setResolver] = useState(null);

  const incidencias = useQuery({ queryKey: QK.incidencias, queryFn: inventarioApi.incidencias.listar });

  const invalidar = () => { qc.invalidateQueries({ queryKey: QK.stock }); qc.invalidateQueries({ queryKey: ["movimientos"] }); qc.invalidateQueries({ queryKey: QK.incidencias }); qc.invalidateQueries({ queryKey: QK.productos }); };
  const err = (e) => showToast(e?.message || "No se pudo registrar.", "error");
  const useAccion = (fn, ok, reset) => useMutation({ mutationFn: fn, onSuccess: (r) => { showToast(typeof ok === "function" ? ok(r) : ok, "success"); invalidar(); reset?.(); }, onError: err });
  const enviarMov = useAccion((b) => inventarioApi.operaciones.movimiento(b), "Movimiento registrado.", () => setMov((m) => ({ ...m, cantidad: "", motivo: "" })));
  const enviarFrac = useAccion((b) => inventarioApi.operaciones.fraccionar(b), (r) => r?.movimiento?.descripcion || "Fraccionado.", () => setFrac((f) => ({ ...f, asignaciones: {} })));
  const enviarCorr = useAccion((b) => inventarioApi.operaciones.corregirFraccionado(b), (r) => (r?.sinCambios ? "Ya estaba así: sin cambios." : r?.movimiento?.descripcion || "Corregido."), () => setCorr((c) => ({ ...c, cantidadReal: "", motivo: "" })));
  const enviarInc = useAccion((b) => inventarioApi.incidencias.crear(b), (r) => `${r.codigo} creada: la mercadería queda apartada.`, () => setInc((i) => ({ ...i, cantidad: "", motivo: "" })));
  const avanzarInc = useAccion((id) => inventarioApi.incidencias.avanzar(id), "Pasó a revisión.");
  const resolverInc = useAccion(({ id, resolucion }) => inventarioApi.incidencias.resolver(id, resolucion), "Incidencia resuelta.", () => setResolver(null));

  const SucursalSelect = ({ value, onChange }) => (
    <TextField select size="small" label="Sucursal" value={value ?? ""} onChange={(e) => onChange(e.target.value)} disabled={!esJefe} helperText={!esJefe ? "La de tu sesión." : undefined}>
      {(sucursales.data || []).map((s) => <MenuItem key={s.id} value={s.id}>{s.nombre}</MenuItem>)}
    </TextField>
  );

  const prodMov = productoDe(mov.productoId);
  const dispMov = mov.productoId ? cantidad(mov.productoId, Number(mov.sucursalId), mov.presId ? Number(mov.presId) : null) : null;
  const prodFrac = productoDe(frac.productoId);
  const granelDisp = frac.productoId ? cantidad(frac.productoId, Number(frac.sucursalId)) : 0;
  const kgNecesarios = useMemo(() => (prodFrac?.presentaciones || []).reduce((a, pr) => a + (Number(frac.asignaciones[pr.id]) || 0) * pr.tamKg, 0), [prodFrac, frac.asignaciones]);
  const prodCorr = productoDe(corr.productoId);
  const presCorr = (prodCorr?.presentaciones || []).find((x) => x.id === Number(corr.presId));
  const actualCorr = presCorr ? cantidad(corr.productoId, Number(corr.sucursalId), presCorr.id) : null;
  const dispInc = inc.productoId ? cantidad(inc.productoId, Number(inc.sucursalId), inc.presId ? Number(inc.presId) : null) : null;

  const puedeTipo = (t) => can(TIPOS_MANUALES[t].llave);
  const puedeFraccionar = check("fraccionar");
  const puedeIncidencia = check("incidencia_crear");
  const puedeResolver = check("inventario");

  const colsInc = [
    { field: "codigo", headerName: "Código", renderCell: (i) => <strong>{i.codigo}</strong> },
    { field: "fecha", headerName: "Fecha", renderCell: (i) => <span className="nowrap">{stamp(i.fecha)}</span> },
    { field: "producto", headerName: "Producto", renderCell: (i) => <Box><strong>{productoDe(i.producto_id)?.nombre || `#${i.producto_id}`}</strong><Typography variant="caption" color="text.secondary" display="block">{formaDe(productoDe(i.producto_id), i.presentacion_id)} · {sucursalDe(i.sucursal_id)?.nombre}</Typography></Box> },
    { field: "tipo", headerName: "Tipo" },
    { field: "cantidad", headerName: "Cantidad", align: "right", renderCell: (i) => `${num(i.cantidad)} ${i.unidad}` },
    { field: "estado", headerName: "Estado", renderCell: (i) => <StatusBadge tone={i.estado === "resuelta" ? "success" : i.estado === "revision" ? "info" : "warning"} label={i.estado === "revision" ? "En revisión" : i.estado} /> },
    { field: "motivo", headerName: "Motivo / resolución", renderCell: (i) => <span className="text-tertiary">{i.resolucion ? `${RESOLUCIONES[i.resolucion] || i.resolucion} · ${stamp(i.fecha_resolucion)}` : i.motivo || "—"}</span> },
    { field: "acciones", headerName: "", align: "right", sortable: false, renderCell: (i) => i.estado !== "resuelta" && (
      <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
        {i.estado === "pendiente" && puedeIncidencia.allowed && <Button size="small" variant="ghost" onClick={(e) => { e.stopPropagation(); avanzarInc.mutate(i.id); }}>A revisión</Button>}
        {puedeResolver.allowed && <Button size="small" variant="secondary" onClick={(e) => { e.stopPropagation(); setResolver({ id: i.id, codigo: i.codigo, resolucion: "liberar" }); }}>Resolver</Button>}
      </Box>
    ) },
  ];

  return (
    <Box className="page fade-in">
      <PageHeader title="Operaciones" subtitle="Lo que mueve stock a mano. Cada operación exige su permiso, valida el disponible y deja un movimiento con quién y por qué." />
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Movimiento manual" /><Tab label="Fraccionar" /><Tab label="Corregir fraccionado" /><Tab label={`Incidencias (${(incidencias.data || []).filter((i) => i.estado !== "resuelta").length})`} />
      </Tabs>

      {tab === 0 && (
        <Card className="entity-card" sx={{ display: "grid", gap: 2, maxWidth: 720 }}>
          <TextField select size="small" label="Tipo" value={mov.tipo} onChange={(e) => setMov({ ...mov, tipo: e.target.value })}>
            {Object.entries(TIPOS_MANUALES).map(([k, v]) => <MenuItem key={k} value={k} disabled={!puedeTipo(k)}>{v.label}{!puedeTipo(k) ? " · sin permiso" : ""}</MenuItem>)}
          </TextField>
          <ProductoForma productos={productos.data} value={mov} onChange={(v) => setMov({ ...mov, ...v })} />
          <SucursalSelect value={mov.sucursalId} onChange={(v) => setMov({ ...mov, sucursalId: v })} />
          {mov.tipo === "ajuste" && (
            <TextField select size="small" label="Sentido" value={mov.signo} onChange={(e) => setMov({ ...mov, signo: Number(e.target.value) })}>
              <MenuItem value={1}>Suma (+)</MenuItem><MenuItem value={-1}>Resta (−)</MenuItem>
            </TextField>
          )}
          <TextField size="small" type="number" label={`Cantidad${prodMov ? ` (${mov.presId ? "paquetes" : prodMov.tipo === "granel" ? "kg" : "u"})` : ""}`} value={mov.cantidad} onChange={(e) => setMov({ ...mov, cantidad: e.target.value })}
            helperText={dispMov != null ? `Disponible ahora: ${num(dispMov)}` : undefined} />
          <TextField size="small" label="Motivo" value={mov.motivo} onChange={(e) => setMov({ ...mov, motivo: e.target.value })} helperText={mov.tipo === "ajuste" ? "Obligatorio en un ajuste: es lo que queda en el historial." : "Opcional."} />
          <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
            <Button variant="primary" loading={enviarMov.isPending} disabled={!mov.productoId || !(Number(mov.cantidad) > 0) || !puedeTipo(mov.tipo)}
              onClick={() => enviarMov.mutate({ tipo: mov.tipo, productoId: mov.productoId, presId: mov.presId || undefined, sucursalId: Number(mov.sucursalId), cantidad: Number(mov.cantidad), signo: mov.signo, motivo: mov.motivo })}>
              Registrar
            </Button>
          </Box>
        </Card>
      )}

      {tab === 1 && (
        <Card className="entity-card" sx={{ display: "grid", gap: 2, maxWidth: 720 }}>
          <Typography variant="body2" color="text.secondary">Descuenta granel y crea paquetes en la misma sucursal. El fraccionamiento no crea ni destruye mercadería: la convierte.</Typography>
          <ProductoForma productos={productos.data} value={frac} onChange={(v) => setFrac({ ...frac, productoId: v.productoId, asignaciones: {} })} soloGranel />
          <SucursalSelect value={frac.sucursalId} onChange={(v) => setFrac({ ...frac, sucursalId: v })} />
          {prodFrac && (
            <Box className="inv-breakdown-table" sx={{ display: "grid", gap: 1.5 }}>
              <Typography variant="body2">Granel disponible: <strong>{num(granelDisp)} kg</strong></Typography>
              {(prodFrac.presentaciones || []).map((pr) => (
                <TextField key={pr.id} size="small" type="number" label={`Paquetes de ${fmtTam(pr.tamKg)}`} value={frac.asignaciones[pr.id] ?? ""} onChange={(e) => setFrac({ ...frac, asignaciones: { ...frac.asignaciones, [pr.id]: e.target.value } })} />
              ))}
              {!(prodFrac.presentaciones || []).length && <Typography variant="body2" color="warning.main">Este granel no tiene presentaciones: cargalas en su ficha.</Typography>}
              <Typography variant="body2" className={kgNecesarios > granelDisp ? "inv-adj-net--neg" : "inv-adj-net--pos"}>Consume {num(kgNecesarios)} kg{kgNecesarios > granelDisp ? " — no alcanza" : ""}</Typography>
            </Box>
          )}
          <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
            <Tooltip title={puedeFraccionar.allowed ? "" : puedeFraccionar.reason}><span>
              <Button variant="primary" loading={enviarFrac.isPending} disabled={!puedeFraccionar.allowed || !prodFrac || kgNecesarios <= 0 || kgNecesarios > granelDisp}
                onClick={() => enviarFrac.mutate({ productoId: frac.productoId, sucursalId: Number(frac.sucursalId), asignaciones: Object.entries(frac.asignaciones).map(([presId, cant]) => ({ presId: Number(presId), cant: Number(cant) || 0 })) })}>
                Fraccionar
              </Button>
            </span></Tooltip>
          </Box>
        </Card>
      )}

      {tab === 2 && (
        <Card className="entity-card" sx={{ display: "grid", gap: 2, maxWidth: 720 }}>
          <Typography variant="body2" color="text.secondary">"Puse 20 paquetes y son 19." Mueve las DOS puntas: los paquetes y el granel del que salieron. Si el paquete se rompió, eso es una merma, no una corrección.</Typography>
          <ProductoForma productos={productos.data} value={corr} onChange={(v) => setCorr({ ...corr, productoId: v.productoId, presId: "" })} soloGranel />
          {prodCorr && (
            <TextField select size="small" label="Paquete" value={corr.presId} onChange={(e) => setCorr({ ...corr, presId: e.target.value })}>
              {(prodCorr.presentaciones || []).map((pr) => <MenuItem key={pr.id} value={pr.id}>Paquete {fmtTam(pr.tamKg)}</MenuItem>)}
            </TextField>
          )}
          <SucursalSelect value={corr.sucursalId} onChange={(v) => setCorr({ ...corr, sucursalId: v })} />
          <TextField size="small" type="number" label="Cantidad real de paquetes" value={corr.cantidadReal} onChange={(e) => setCorr({ ...corr, cantidadReal: e.target.value })} helperText={actualCorr != null ? `El sistema dice ${num(actualCorr)}.` : undefined} />
          <TextField size="small" label="Motivo" value={corr.motivo} onChange={(e) => setCorr({ ...corr, motivo: e.target.value })} />
          <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
            <Button variant="primary" loading={enviarCorr.isPending} disabled={!puedeFraccionar.allowed || !presCorr || corr.cantidadReal === ""}
              onClick={() => enviarCorr.mutate({ productoId: corr.productoId, presId: Number(corr.presId), sucursalId: Number(corr.sucursalId), cantidadReal: Number(corr.cantidadReal), motivo: corr.motivo })}>
              Corregir
            </Button>
          </Box>
        </Card>
      )}

      {tab === 3 && (
        <Box sx={{ display: "grid", gap: 2 }}>
          <Card className="entity-card" sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, alignItems: "start" }}>
            <Box sx={{ gridColumn: "1 / -1" }}><Typography className="card-title">Nueva incidencia</Typography><Typography variant="body2" color="text.secondary">Aparta la mercadería (disponible → comprometido) hasta que se resuelva: liberar, merma, vencido o defectuoso.</Typography></Box>
            <ProductoForma productos={productos.data} value={inc} onChange={(v) => setInc({ ...inc, ...v })} />
            <SucursalSelect value={inc.sucursalId} onChange={(v) => setInc({ ...inc, sucursalId: v })} />
            <TextField select size="small" label="Tipo" value={inc.tipo} onChange={(e) => setInc({ ...inc, tipo: e.target.value })}>{TIPOS_INCIDENCIA.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}</TextField>
            <TextField size="small" type="number" label="Cantidad" value={inc.cantidad} onChange={(e) => setInc({ ...inc, cantidad: e.target.value })} helperText={dispInc != null ? `Disponible: ${num(dispInc)}` : undefined} />
            <TextField size="small" label="Motivo" value={inc.motivo} onChange={(e) => setInc({ ...inc, motivo: e.target.value })} sx={{ gridColumn: { md: "span 2" } }} />
            <Box sx={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
              <Tooltip title={puedeIncidencia.allowed ? "" : puedeIncidencia.reason}><span>
                <Button variant="primary" loading={enviarInc.isPending} disabled={!puedeIncidencia.allowed || !inc.productoId || !(Number(inc.cantidad) > 0)}
                  onClick={() => enviarInc.mutate({ productoId: inc.productoId, presId: inc.presId || undefined, sucursalId: Number(inc.sucursalId), tipo: inc.tipo, cantidad: Number(inc.cantidad), motivo: inc.motivo })}>
                  Crear incidencia
                </Button>
              </span></Tooltip>
            </Box>
          </Card>
          <DataTable columns={colsInc} data={(incidencias.data || []).map((i) => ({ ...i, id: i.id }))} loading={incidencias.isLoading} emptyMessage="Sin incidencias." />
        </Box>
      )}

      <Modal open={Boolean(resolver)} onClose={() => setResolver(null)} title={`Resolver ${resolver?.codigo}`} subtitle="Liberar devuelve la mercadería a disponible; las bajas la sacan con el costo del día congelado."
        actions={(<><Button variant="ghost" onClick={() => setResolver(null)}>Cancelar</Button><Button variant="primary" loading={resolverInc.isPending} onClick={() => resolverInc.mutate(resolver)}>Resolver</Button></>)}>
        <TextField select fullWidth size="small" label="Resolución" value={resolver?.resolucion || "liberar"} onChange={(e) => setResolver({ ...resolver, resolucion: e.target.value })} sx={{ mt: 1 }}>
          {Object.entries(RESOLUCIONES).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
        </TextField>
      </Modal>
    </Box>
  );
};

export default Ajustes;
