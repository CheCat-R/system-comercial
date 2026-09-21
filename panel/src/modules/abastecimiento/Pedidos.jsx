/**
 * PEDIDOS AL PROVEEDOR — la pizarra entre el admin y el encargado de compras:
 * a quién hay que pedirle, a quién ya se le pidió, qué quedó para retomar. No
 * toca stock ni deuda: eso pasa al cargar la factura. Abajo, lo recibido y
 * cuánto tardó cada proveedor.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Autocomplete from "@mui/material/Autocomplete";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import IconButton from "@mui/material/IconButton";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import { QK } from "../../app/api/queryClient";
import { proveedoresApi } from "./api/proveedoresApi";
import { comprasApi, ESTADOS_PEDIDO, stamp, fecha } from "./api/comprasApi";
import "./Compras.css";

const COLUMNAS = [["solicitado", "Hay que pedir"], ["pedido", "Pedido, esperando"], ["retomar", "Retomar"]];
const hace = (iso) => { if (!iso) return ""; const d = Math.round((Date.now() - new Date(iso).getTime()) / 86400000); return d <= 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`; };

const Pedidos = () => {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState(0);
  const [modal, setModal] = useState(null);
  const [filtro, setFiltro] = useState("mes");
  const proveedores = useQuery({ queryKey: QK.proveedores, queryFn: () => proveedoresApi.listar("mercaderia") });
  const kanban = useQuery({ queryKey: ["pedidos", "kanban"], queryFn: comprasApi.pedidos.kanban, refetchInterval: 60_000 });
  const recibidos = useQuery({ queryKey: ["pedidos", "recibidos", filtro], queryFn: () => comprasApi.pedidos.recibidos({ filtro, limit: 100 }), enabled: tab === 1 });
  const invalidar = () => qc.invalidateQueries({ queryKey: ["pedidos"] });
  const err = (e) => showToast(e?.message || "No se pudo.", "error");
  const mAlta = useMutation({ mutationFn: ({ ids, notas, directo }) => (directo ? comprasApi.pedidos.directo(ids[0], notas) : comprasApi.pedidos.alta(ids, notas)), onSuccess: () => { showToast("Tarjeta(s) creada(s).", "success"); setModal(null); invalidar(); }, onError: err });
  const mEditar = useMutation({ mutationFn: ({ id, notas }) => comprasApi.pedidos.editar(id, { notas }), onSuccess: () => { setModal(null); invalidar(); }, onError: err });
  const mEstado = useMutation({ mutationFn: ({ id, estado }) => comprasApi.pedidos.estado(id, estado), onSuccess: invalidar, onError: err });
  const mEnviado = useMutation({ mutationFn: (id) => comprasApi.pedidos.enviado(id), onSuccess: invalidar, onError: err });
  const mRevisado = useMutation({ mutationFn: ({ id, deshacer }) => comprasApi.pedidos.revisado(id, deshacer), onSuccess: invalidar, onError: err });
  const mBorrar = useMutation({ mutationFn: (id) => comprasApi.pedidos.borrar(id), onSuccess: invalidar, onError: err });

  const tarjetas = kanban.data || [];

  return (
    <Box className="page fade-in">
      <PageHeader title="Pedidos a proveedores" subtitle="Coordinación pura: a quién pedirle, qué se pidió y qué llegó. La mercadería y la deuda entran por Compras."
        actions={<Button variant="primary" startIcon={<AddIcon />} onClick={() => setModal({ alta: true, ids: [], notas: "", directo: false })}>Nueva tarjeta</Button>} />
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}><Tab label={`Pizarra (${tarjetas.length})`} /><Tab label="Recibidos" /></Tabs>

      {tab === 0 && (
        <Box className="pedidos-kanban">
          {COLUMNAS.map(([estado, titulo]) => {
            const col = tarjetas.filter((t) => t.estado === estado);
            return (
              <Box key={estado} className="pedidos-col">
                <Box className="pedidos-col__titulo"><span>{titulo}</span><StatusBadge tone={ESTADOS_PEDIDO[estado].tone} label={String(col.length)} showDot={false} /></Box>
                {col.length === 0 && <Typography variant="caption" color="text.secondary">Nada por acá.</Typography>}
                {col.map((t) => (
                  <Box key={t.id} className="pedido-card">
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 1 }}>
                      <Box><strong>{t.proveedorNombre}</strong><Typography variant="caption" display="block" color="text.secondary">trae {t.productosProveedor} producto(s) · alta {hace(t.fechaAlta)}{t.fechaPedido ? ` · pedido ${fecha(t.fechaPedido)}` : ""}</Typography></Box>
                      <Box sx={{ display: "flex" }}><IconButton size="small" onClick={() => setModal({ editar: t, notas: t.notas || "" })}><EditOutlinedIcon fontSize="small" /></IconButton><IconButton size="small" onClick={() => { if (window.confirm("¿Borrar la tarjeta?")) mBorrar.mutate(t.id); }}><DeleteOutlineIcon fontSize="small" /></IconButton></Box>
                    </Box>
                    {t.notas && <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{t.notas}</Typography>}
                    {estado === "solicitado" && (
                      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                        {t.pedidoEnviado && <StatusBadge tone="info" label="pedido enviado, sin confirmar" showDot={false} />}
                        {t.revisadoAt && <StatusBadge tone="neutral" label={`visto ${hace(t.revisadoAt)}`} showDot={false} />}
                      </Box>
                    )}
                    <Box className="pedido-card__acciones">
                      {estado === "solicitado" && <><Button size="small" variant="ghost" onClick={() => mEnviado.mutate(t.id)}>{t.pedidoEnviado ? "No enviado" : "Enviado"}</Button><Button size="small" variant="ghost" onClick={() => mRevisado.mutate({ id: t.id, deshacer: Boolean(t.revisadoAt) })}>{t.revisadoAt ? "Deshacer visto" : "Ya lo vi"}</Button></>}
                      {estado !== "pedido" && <Button size="small" variant="secondary" onClick={() => mEstado.mutate({ id: t.id, estado: "pedido" })}>Pedido</Button>}
                      {estado !== "solicitado" && <Button size="small" variant="ghost" onClick={() => mEstado.mutate({ id: t.id, estado: "solicitado" })}>A pedir</Button>}
                      {estado !== "retomar" && <Button size="small" variant="ghost" onClick={() => mEstado.mutate({ id: t.id, estado: "retomar" })}>Retomar</Button>}
                      <Button size="small" variant="primary" onClick={() => mEstado.mutate({ id: t.id, estado: "recibido" })}>Llegó</Button>
                    </Box>
                  </Box>
                ))}
              </Box>
            );
          })}
        </Box>
      )}

      {tab === 1 && (
        <Box>
          <Box sx={{ display: "flex", gap: 2, alignItems: "center", mb: 1 }}>
            <TextField select size="small" value={filtro} onChange={(e) => setFiltro(e.target.value)}><MenuItem value="semana">Última semana</MenuItem><MenuItem value="mes">Este mes</MenuItem><MenuItem value="mes_ant">Mes anterior</MenuItem><MenuItem value="">Todo</MenuItem></TextField>
            {recibidos.data && <Typography variant="body2" color="text.secondary">{recibidos.data.totalMes} recibidos este mes · demora promedio {recibidos.data.promedioDias} días</Typography>}
          </Box>
          <DataTable columns={[
            { field: "fechaRecepcion", headerName: "Recibido", renderCell: (r) => stamp(r.fechaRecepcion) }, { field: "proveedorNombre", headerName: "Proveedor" },
            { field: "fechaPedido", headerName: "Pedido", renderCell: (r) => fecha(r.fechaPedido) }, { field: "dias", headerName: "Demora", align: "right", renderCell: (r) => (r.dias == null ? "—" : `${r.dias} d`) },
            { field: "notas", headerName: "Notas", renderCell: (r) => <span className="text-tertiary">{r.notas || "—"}</span> },
          ]} data={recibidos.data?.filas || []} loading={recibidos.isLoading} emptyMessage="Nada recibido en ese período." />
        </Box>
      )}

      <Modal open={Boolean(modal?.alta)} onClose={() => setModal(null)} title="Nueva tarjeta" subtitle="Una por proveedor. Las notas son informales: qué hace falta pedir."
        actions={(<><Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button><Button variant="primary" loading={mAlta.isPending} disabled={!modal?.ids?.length} onClick={() => mAlta.mutate({ ids: modal.ids, notas: modal.notas, directo: modal.directo })}>Crear</Button></>)}>
        {modal?.alta && (
          <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
            <Autocomplete multiple={!modal.directo} size="small" options={proveedores.data || []} getOptionLabel={(p) => p.nombre}
              value={modal.directo ? ((proveedores.data || []).find((p) => p.id === modal.ids[0]) || null) : (proveedores.data || []).filter((p) => modal.ids.includes(p.id))}
              onChange={(_, v) => setModal({ ...modal, ids: modal.directo ? (v ? [v.id] : []) : v.map((p) => p.id) })} renderInput={(p) => <TextField {...p} label="Proveedor(es)" autoFocus />} />
            <TextField select size="small" label="Nace en" value={modal.directo ? "pedido" : "solicitado"} onChange={(e) => setModal({ ...modal, directo: e.target.value === "pedido", ids: modal.ids.slice(0, e.target.value === "pedido" ? 1 : undefined) })}>
              <MenuItem value="solicitado">Hay que pedir</MenuItem><MenuItem value="pedido">Ya lo pedí (registrarlo con fecha)</MenuItem>
            </TextField>
            <TextField size="small" label="Notas" value={modal.notas} onChange={(e) => setModal({ ...modal, notas: e.target.value })} multiline minRows={3} />
          </Box>
        )}
      </Modal>
      <Modal open={Boolean(modal?.editar)} onClose={() => setModal(null)} title={modal?.editar?.proveedorNombre || ""}
        actions={(<><Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button><Button variant="primary" loading={mEditar.isPending} onClick={() => mEditar.mutate({ id: modal.editar.id, notas: modal.notas })}>Guardar</Button></>)}>
        {modal?.editar && <TextField size="small" label="Notas" value={modal.notas} onChange={(e) => setModal({ ...modal, notas: e.target.value })} multiline minRows={4} fullWidth sx={{ mt: 1 }} autoFocus />}
      </Modal>
    </Box>
  );
};

export default Pedidos;
