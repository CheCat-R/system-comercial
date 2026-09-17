/** Un control de stock: contar renglón por renglón, cerrar, revisar diferencias y aplicar. */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import Checkbox from "@mui/material/Checkbox";
import Tooltip from "@mui/material/Tooltip";

import SearchIcon from "@mui/icons-material/Search";

import EntityHeader from "../../components/EntityHeader/EntityHeader";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { useEntityLabel } from "../../components/Breadcrumbs/EntityLabelContext";
import { QK } from "../../app/api/queryClient";
import { inventarioApi, ESTADOS_CONTEO, num, money, stamp } from "./api/inventarioApi";
import { useInventarioBase } from "./hooks/useInventario";
import "./InventarioFisicoDetalle.css";

const InventarioFisicoDetalle = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { can } = useAuth();
  const qc = useQueryClient();
  const { sucursalDe } = useInventarioBase();
  const puedeAplicar = can("conteos_aplicar");
  const [search, setSearch] = useState("");
  const [soloPendientes, setSoloPendientes] = useState(false);

  const c = useQuery({ queryKey: QK.conteo(id), queryFn: () => inventarioApi.conteos.get(id) });
  const data = c.data;
  const { setLabel } = useEntityLabel();
  useEffect(() => { if (data) setLabel(id, data.nombre || `Control #${id}`); }, [id, data, setLabel]);

  const invalidar = () => { qc.invalidateQueries({ queryKey: QK.conteo(id) }); qc.invalidateQueries({ queryKey: QK.conteos }); };
  const err = (e) => showToast(e?.message || "No se pudo.", "error");
  const mutar = (fn, ok, extra) => useMutation({ mutationFn: fn, onSuccess: (r) => { if (ok) showToast(typeof ok === "function" ? ok(r) : ok, "success"); invalidar(); extra?.(r); }, onError: err });
  /* eslint-disable react-hooks/rules-of-hooks */
  const contar = mutar(({ itemId, contado }) => inventarioApi.conteos.contar(id, itemId, contado), null);
  const cerrar = mutar(() => inventarioApi.conteos.cerrar(id), "Control cerrado: la foto final. Ahora se revisa y se aplica.");
  const reabrir = mutar(() => inventarioApi.conteos.reabrir(id), "Reabierto para seguir contando.");
  const recontar = mutar(({ itemId, recontar: v }) => inventarioApi.conteos.recontar(id, itemId, v), null);
  const aplicar = mutar(() => inventarioApi.conteos.aplicar(id), (r) => `${r.ajustes} ajuste(s) aplicados, ${r.sinDiferencia} sin diferencia.${r.avisos?.length ? ` Avisos: ${r.avisos.length}.` : ""}`, (r) => { qc.invalidateQueries({ queryKey: QK.stock }); qc.invalidateQueries({ queryKey: ["movimientos"] }); if (r.avisos?.length) r.avisos.forEach((a) => showToast(a, "warning")); });
  const descartar = mutar(() => inventarioApi.conteos.descartar(id), "Control descartado.", () => navigate("/inventario/fisico"));
  /* eslint-enable react-hooks/rules-of-hooks */

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.items || []).filter((i) => (!q || i.nombre.toLowerCase().includes(q)) && (!soloPendientes || i.contado == null || i.recontar));
  }, [data, search, soloPendientes]);

  const resumen = useMemo(() => {
    const its = data?.items || [];
    const conDif = its.filter((i) => i.diferencia != null && Math.abs(i.diferencia) > 1e-9);
    return { total: its.length, contados: its.filter((i) => i.contado != null).length, conDif: conDif.length, plata: conDif.reduce((a, i) => a + (i.diferenciaPlata || 0), 0), recontar: its.filter((i) => i.recontar).length };
  }, [data]);

  if (c.isLoading) return <div className="route-loading" aria-busy="true" />;
  if (!data) return <Box className="page"><Typography>Control inexistente.</Typography></Box>;

  const enCurso = data.estado === "en_curso";
  const cerrado = data.estado === "cerrado";
  const veVirtual = data.puedeVerVirtual || !data.ciego || !enCurso;

  const columns = [
    { field: "nombre", headerName: "Producto", width: "30%", renderCell: (i) => <Box><strong>{i.nombre}</strong><Typography variant="caption" color="text.secondary" display="block">{i.presLabel || (i.unidad === "kg" ? "granel suelto" : "unidad")}{i.apartados > 0 ? ` · ${num(i.apartados)} apartados (no se cuentan)` : ""}</Typography></Box> },
    ...(veVirtual && "virtual" in (data.items?.[0] || {}) ? [{ field: "virtual", headerName: "Sistema", align: "right", renderCell: (i) => <span className="inv-num">{num(i.virtual)} {i.unidad}</span> }] : []),
    {
      field: "contado", headerName: "Contado", align: "right", sortable: false,
      renderCell: (i) => (enCurso
        ? <TextField size="small" type="number" defaultValue={i.contado ?? ""} placeholder="—" onClick={(e) => e.stopPropagation()}
          onBlur={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v !== (i.contado ?? null)) contar.mutate({ itemId: i.id, contado: v }); }} sx={{ width: 110 }} />
        : <span className="inv-num">{i.contado == null ? <span className="text-tertiary">sin contar</span> : `${num(i.contado)} ${i.unidad}`}</span>),
    },
    ...("diferencia" in (data.items?.[0] || {}) ? [
      { field: "diferencia", headerName: "Diferencia", align: "right", sortValue: (i) => i.diferencia ?? 0, renderCell: (i) => (i.diferencia == null ? <span className="text-tertiary">—</span> : <span className={`inv-count-diff ${i.diferencia > 0 ? "inv-count-diff--pos" : i.diferencia < 0 ? "inv-count-diff--neg" : "inv-count-diff--zero"}`}>{i.diferencia > 0 ? "+" : ""}{num(i.diferencia)}{i.seMovio ? " ⚠" : ""}</span>) },
      { field: "diferenciaPlata", headerName: "En plata", align: "right", sortValue: (i) => i.diferenciaPlata ?? 0, renderCell: (i) => (i.diferenciaPlata == null ? "—" : <span className={i.diferenciaPlata < 0 ? "inv-count-diff--neg" : "inv-count-diff--pos"}>{money(i.diferenciaPlata)}</span>) },
    ] : []),
    { field: "contadoEn", headerName: "Contado", renderCell: (i) => <span className="text-tertiary nowrap">{i.contadoEn ? stamp(i.contadoEn) : "—"}</span> },
    ...(puedeAplicar && (enCurso || cerrado) ? [{ field: "recontar", headerName: "Recontar", align: "center", sortable: false, renderCell: (i) => <Checkbox size="small" checked={Boolean(i.recontar)} onClick={(e) => e.stopPropagation()} onChange={(e) => recontar.mutate({ itemId: i.id, recontar: e.target.checked })} /> }] : []),
  ];

  return (
    <Box className="page fade-in">
      <EntityHeader
        eyebrow={`${sucursalDe(data.sucursal_id)?.nombre || ""} · ${data.alcance}`}
        title={data.nombre || `Control #${data.id}`}
        subtitle={`Abierto ${stamp(data.created_at)}${data.cerrado_en ? ` · cerrado ${stamp(data.cerrado_en)}` : ""}${data.aplicado_en ? ` · aplicado ${stamp(data.aplicado_en)}` : ""}`}
        badges={<><StatusBadge tone={ESTADOS_CONTEO[data.estado]?.tone} label={ESTADOS_CONTEO[data.estado]?.label} /><StatusBadge tone="neutral" label={data.ciego ? "Ciego" : "A la vista"} showDot={false} /></>}
        onBack={() => navigate("/inventario/fisico")}
        actions={(
          <>
            {(enCurso || cerrado) && <Button size="small" variant="ghost" onClick={() => { if (window.confirm("¿Descartar el control? Se pierde lo contado.")) descartar.mutate(); }}>Descartar</Button>}
            {enCurso && <Button size="small" variant="primary" loading={cerrar.isPending} onClick={() => cerrar.mutate()}>Cerrar conteo</Button>}
            {cerrado && <Button size="small" variant="ghost" onClick={() => reabrir.mutate()}>Reabrir</Button>}
            {cerrado && <Tooltip title={puedeAplicar ? "" : "Aplicar es de quien tiene la llave conteos_aplicar."}><span><Button size="small" variant="primary" disabled={!puedeAplicar} loading={aplicar.isPending} onClick={() => { if (window.confirm(`¿Aplicar ${resumen.conDif} ajuste(s)? Mueve el stock y deja movimientos.`)) aplicar.mutate(); }}>Aplicar ajustes</Button></span></Tooltip>}
          </>
        )}
      />

      <Box className="inv-count-summary">
        <div className="inv-count-summary__item"><span className="inv-count-summary__value">{resumen.contados}/{resumen.total}</span><span className="inv-count-summary__label">contados</span></div>
        {veVirtual && <div className="inv-count-summary__item"><span className="inv-count-summary__value">{resumen.conDif}</span><span className="inv-count-summary__label">con diferencia</span></div>}
        {veVirtual && <div className="inv-count-summary__item"><span className={`inv-count-summary__value ${resumen.plata < 0 ? "inv-count-diff--neg" : ""}`}>{money(resumen.plata)}</span><span className="inv-count-summary__label">diferencia en plata</span></div>}
        <div className="inv-count-summary__item"><span className="inv-count-summary__value">{resumen.recontar}</span><span className="inv-count-summary__label">a recontar</span></div>
      </Box>

      {enCurso && data.ciego && !data.puedeVerVirtual && <Card className="entity-card" sx={{ mb: 2 }}><Typography variant="body2" color="text.secondary">Conteo ciego: el sistema no muestra lo que espera. Contá lo que hay; las diferencias las ve quien aplica.</Typography></Card>}

      <Box className="table-tabs">
        <TextField size="small" placeholder="Buscar renglón…" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 260 }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
        <Button size="small" variant={soloPendientes ? "primary" : "ghost"} onClick={() => setSoloPendientes(!soloPendientes)}>Sólo pendientes / a recontar</Button>
      </Box>
      <DataTable columns={columns} data={items} emptyMessage="Sin renglones." pagination={{ pageSize: 50 }} />
    </Box>
  );
};

export default InventarioFisicoDetalle;
