/**
 * Transferencias entre sucursales, contra la API. Modelo PULL: el DESTINO
 * arma el pedido (borrador → pendiente), el ORIGEN lo prepara en dos listas
 * (enteros y granel) y al confirmar cada una reserva el stock, despacha (en
 * tránsito) y el destino recibe contando lo que llegó.
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
import Tooltip from "@mui/material/Tooltip";

import AddIcon from "@mui/icons-material/Add";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { QK } from "../../app/api/queryClient";
import { inventarioApi, ESTADOS_TRANSFER, stamp } from "./api/inventarioApi";
import { useInventarioBase } from "./hooks/useInventario";
import "./Transferencias.css";

const TABS = [{ key: "", label: "Todas" }, { key: "abiertas", label: "Abiertas" }, { key: "recibida", label: "Recibidas" }, { key: "cancelada", label: "Canceladas" }];

const Transferencias = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user, esJefe, check } = useAuth();
  const qc = useQueryClient();
  const { sucursales, sucursalDe } = useInventarioBase();
  const [tab, setTab] = useState(1);
  const [nuevo, setNuevo] = useState(null); // { origenId, destinoId }
  const puedePedir = check("pedidos");

  const transferencias = useQuery({ queryKey: QK.transferencias, queryFn: inventarioApi.transferencias.listar });

  const abrirBorrador = useMutation({
    mutationFn: (b) => inventarioApi.transferencias.borrador(b),
    onSuccess: (t) => { qc.invalidateQueries({ queryKey: QK.transferencias }); setNuevo(null); navigate(`/inventario/transferencias/${t.id}`); },
    onError: (err) => showToast(err?.message || "No se pudo abrir el pedido.", "error"),
  });

  const rows = useMemo(() => (transferencias.data || []).filter((t) => {
    const k = TABS[tab]?.key;
    if (k === "abiertas") return ["borrador", "pendiente", "preparada", "transito"].includes(t.estado);
    if (k) return t.estado === k;
    return true;
  }).map((t) => ({ ...t, renglones: t.items?.length || 0, kg: t.items?.reduce((a, i) => a + Number(i.cantidad_preparada || i.cantidad || 0), 0) || 0 })), [transferencias.data, tab]);

  const columns = [
    { field: "codigo", headerName: "Código", renderCell: (t) => <strong>{t.codigo || "borrador"}</strong> },
    { field: "fecha", headerName: "Fecha", renderCell: (t) => <span className="nowrap">{stamp(t.fecha)}</span> },
    { field: "ruta", headerName: "Ruta", sortable: false, renderCell: (t) => <span className="inv-transfer-route">{sucursalDe(t.origen_id)?.nombre || "—"} → {sucursalDe(t.destino_id)?.nombre || "—"}</span> },
    { field: "renglones", headerName: "Renglones", align: "right" },
    { field: "estado", headerName: "Estado", renderCell: (t) => <StatusBadge tone={ESTADOS_TRANSFER[t.estado]?.tone} label={ESTADOS_TRANSFER[t.estado]?.label || t.estado} /> },
    { field: "listas", headerName: "Preparación", sortable: false, renderCell: (t) => (t.estado === "preparada"
      ? <span className="text-tertiary">{t.enteros_listo ? "Enteros ✓" : "Enteros …"} · {t.granel_listo ? "Granel ✓" : "Granel …"}</span>
      : <span className="text-tertiary">—</span>) },
  ];

  const otras = (sucursales.data || []);

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Transferencias"
        subtitle="El destino pide, el origen prepara y despacha, el destino recibe contando. El stock acompaña cada estado."
        actions={(
          <Tooltip title={puedePedir.allowed ? "" : puedePedir.reason}><span>
            <Button variant="primary" startIcon={<AddIcon />} disabled={!puedePedir.allowed} onClick={() => setNuevo({ origenId: otras.find((s) => s.tipo === "distribuidora")?.id ?? "", destinoId: user?.sucursalId ?? "" })}>Nuevo pedido</Button>
          </span></Tooltip>
        )}
      />
      <Box className="table-tabs"><Tabs value={tab} onChange={(_, v) => setTab(v)}>{TABS.map((t) => <Tab key={t.key} label={t.label} />)}</Tabs></Box>
      <DataTable columns={columns} data={rows} loading={transferencias.isLoading} emptyMessage="Sin transferencias." onRowClick={(t) => navigate(`/inventario/transferencias/${t.id}`)} pagination={{ pageSize: 25 }} />

      <Modal open={Boolean(nuevo)} onClose={() => setNuevo(null)} title="Nuevo pedido a otra sucursal" subtitle="Se abre como borrador: se arma con calma y se envía cuando está listo. Hay un solo borrador por ruta."
        actions={(<><Button variant="ghost" onClick={() => setNuevo(null)}>Cancelar</Button><Button variant="primary" loading={abrirBorrador.isPending} disabled={!nuevo?.origenId || !nuevo?.destinoId || nuevo.origenId === nuevo.destinoId} onClick={() => abrirBorrador.mutate(nuevo)}>Abrir borrador</Button></>)}>
        {nuevo && (
          <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
            <TextField select size="small" label="Pedir a (origen)" value={nuevo.origenId} onChange={(e) => setNuevo({ ...nuevo, origenId: e.target.value })}>
              {otras.map((s) => <MenuItem key={s.id} value={s.id}>{s.nombre}</MenuItem>)}
            </TextField>
            <TextField select size="small" label="Para (destino)" value={nuevo.destinoId} onChange={(e) => setNuevo({ ...nuevo, destinoId: e.target.value })} disabled={!esJefe} helperText={!esJefe ? "Tu sucursal." : undefined}>
              {otras.map((s) => <MenuItem key={s.id} value={s.id}>{s.nombre}</MenuItem>)}
            </TextField>
          </Box>
        )}
      </Modal>
    </Box>
  );
};

export default Transferencias;
