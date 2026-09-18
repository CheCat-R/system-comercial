/**
 * PRESUPUESTOS — la bandeja de los pedidos mayoristas. Se cotizan acá (o desde
 * el POS con «Presupuesto»), se envían, el cliente confirma (se reserva stock),
 * se arman y se cierran en el punto de venta.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Autocomplete from "@mui/material/Autocomplete";
import AddIcon from "@mui/icons-material/Add";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { ventasApi, ENTREGAS, ESTADOS_PRESUPUESTO, money, stamp } from "./api/ventasApi";
import EditorPresupuesto from "./components/EditorPresupuesto";

const TABS = [{ key: "abiertos", label: "Abiertos" }, { key: "pendiente", label: "Pedidos web" }, { key: "cerrado", label: "Cerrados" }, { key: "cancelado", label: "Cancelados" }, { key: "", label: "Todos" }];

const Presupuestos = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user, check } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState(0);
  const [nuevo, setNuevo] = useState(null);
  const puede = check("presupuestos");

  const lista = useQuery({ queryKey: ["presupuestos"], queryFn: () => ventasApi.presupuestos.listar({ limit: 500 }) });
  const boot = useQuery({ queryKey: ["ventas", "bootstrap"], queryFn: ventasApi.bootstrap, staleTime: 60_000 });
  const catalogo = useQuery({ queryKey: ["pos", "catalogo", user?.sucursalId], queryFn: () => ventasApi.catalogo(user?.sucursalId), enabled: Boolean(nuevo) && Boolean(user?.sucursalId), staleTime: 5 * 60_000 });
  const clientes = useMemo(() => (boot.data?.clientes || []).filter((c) => !c.esConsumidorFinal && c.activo), [boot.data]);

  const mCrear = useMutation({
    mutationFn: (b) => ventasApi.presupuestos.crear(b),
    onSuccess: (r) => { showToast(`Presupuesto ${r.codigo} guardado como borrador.`, "success"); setNuevo(null); qc.invalidateQueries({ queryKey: ["presupuestos"] }); navigate(`/ventas/presupuestos/${r.id}`); },
    onError: (e) => showToast(e?.message || "No se pudo crear.", "error"),
  });

  const rows = useMemo(() => (lista.data || []).filter((p) => {
    const k = TABS[tab].key;
    if (k === "abiertos") return ["borrador", "enviado", "confirmado"].includes(p.estado);
    return !k || p.estado === k;
  }), [lista.data, tab]);
  const pendientes = (lista.data || []).filter((p) => p.estado === "pendiente").length;

  const columns = [
    { field: "codigo", headerName: "Código", renderCell: (p) => <strong>{p.codigo}</strong> },
    { field: "fecha", headerName: "Fecha", renderCell: (p) => <span className="nowrap">{stamp(p.fecha)}</span> },
    { field: "clienteNombre", headerName: "Cliente", renderCell: (p) => p.clienteNombre || <span className="text-tertiary">{p.webCliente ? `${p.webCliente.nombre} ${p.webCliente.apellido} (web)` : "—"}</span> },
    { field: "vendedorNombre", headerName: "Vendedor", renderCell: (p) => <span className="text-tertiary">{p.vendedorNombre || "—"}</span> },
    { field: "entrega", headerName: "Entrega", renderCell: (p) => ENTREGAS[p.entrega] || p.entrega },
    { field: "items", headerName: "Reng.", align: "right", renderCell: (p) => p.items?.length || 0 },
    { field: "total", headerName: "Total", align: "right", renderCell: (p) => <strong>{money(p.total)}</strong> },
    { field: "estado", headerName: "Estado", renderCell: (p) => <><StatusBadge tone={p.vencido ? "error" : ESTADOS_PRESUPUESTO[p.estado]?.tone} label={p.vencido ? "Vencido" : ESTADOS_PRESUPUESTO[p.estado]?.label || p.estado} />{p.reservado && p.estado === "confirmado" && <Typography variant="caption" display="block" color="text.secondary">stock reservado</Typography>}</> },
  ];

  return (
    <Box className="page fade-in">
      <PageHeader title="Presupuestos" subtitle="Borrador → enviado (precios congelados con vencimiento) → confirmado (reserva stock) → cerrado en el POS. Vencido se calcula al mirarlo."
        actions={<Button variant="primary" startIcon={<AddIcon />} disabled={!puede.allowed} onClick={() => setNuevo({ clienteId: null, entrega: "retiro", observaciones: "", items: [] })}>Nuevo presupuesto</Button>} />
      <Box className="table-tabs"><Tabs value={tab} onChange={(_, v) => setTab(v)}>{TABS.map((t) => <Tab key={t.key} label={t.key === "pendiente" && pendientes ? `${t.label} (${pendientes})` : t.label} />)}</Tabs></Box>
      <DataTable columns={columns} data={rows} loading={lista.isLoading} emptyMessage="Sin presupuestos." onRowClick={(p) => navigate(`/ventas/presupuestos/${p.id}`)} pagination={{ pageSize: 25 }} />

      <Modal open={Boolean(nuevo)} onClose={() => setNuevo(null)} title="Nuevo presupuesto" subtitle="Precios NETOS por renglón; el total incluye IVA. Se guarda como borrador y se envía desde su ficha." maxWidth="lg"
        actions={(<><Button variant="ghost" onClick={() => setNuevo(null)}>Cancelar</Button><Button variant="primary" loading={mCrear.isPending} disabled={!nuevo?.clienteId || !nuevo?.items.length} onClick={() => mCrear.mutate({ clienteId: nuevo.clienteId, entrega: nuevo.entrega, observaciones: nuevo.observaciones, items: nuevo.items })}>Guardar borrador</Button></>)}>
        {nuevo && (
          <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
            <Box sx={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 2 }}>
              <Autocomplete size="small" options={clientes} getOptionLabel={(c) => c.nombre} value={clientes.find((c) => c.id === nuevo.clienteId) || null} onChange={(_, c) => setNuevo({ ...nuevo, clienteId: c?.id ?? null })} renderInput={(p) => <TextField {...p} label="Cliente" autoFocus />} />
              <TextField select size="small" label="Entrega" value={nuevo.entrega} onChange={(e) => setNuevo({ ...nuevo, entrega: e.target.value })}>{Object.entries(ENTREGAS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}</TextField>
            </Box>
            {catalogo.data ? <EditorPresupuesto valor={nuevo} onChange={setNuevo} catalogo={catalogo.data.items} listas={catalogo.data.listas} /> : <Typography variant="body2" color="text.secondary">Cargando catálogo…</Typography>}
            <TextField size="small" label="Observaciones" value={nuevo.observaciones} onChange={(e) => setNuevo({ ...nuevo, observaciones: e.target.value })} multiline minRows={2} />
          </Box>
        )}
      </Modal>
    </Box>
  );
};

export default Presupuestos;
