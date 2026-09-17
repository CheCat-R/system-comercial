/** El kardex: la bitácora inmutable de todo lo que entró, salió o cambió de estado. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";

import PageHeader from "../../components/PageHeader/PageHeader";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useAuth } from "../../context/AuthContext";
import { QK } from "../../app/api/queryClient";
import { seguridadApi } from "../seguridad/api/seguridadApi";
import { inventarioApi, TIPOS_MOV, ESTADOS_STOCK, num, stamp } from "./api/inventarioApi";
import { useInventarioBase } from "./hooks/useInventario";
import "./Movimientos.css";

const Movimientos = () => {
  const { user, esJefe } = useAuth();
  const { productoDe, sucursalDe } = useInventarioBase();
  const [q, setQ] = useState({ productoId: "", sucursalId: "", tipo: "", desde: "", hasta: "" });

  const usuarios = useQuery({ queryKey: QK.usuarios, queryFn: seguridadApi.usuarios, enabled: esJefe });
  const movimientos = useQuery({ queryKey: QK.movimientos(q), queryFn: () => inventarioApi.movimientos({ ...q, limit: 500 }) });
  const { sucursales, productos } = useInventarioBase();
  const nombreUsuario = (id) => (usuarios.data || []).find((u) => u.id === id)?.nombre || (id === user?.id ? user.nombre : "—");

  const columns = [
    { field: "fecha", headerName: "Fecha", renderCell: (m) => <span className="nowrap">{stamp(m.fecha)}</span> },
    { field: "tipo", headerName: "Tipo", renderCell: (m) => <StatusBadge tone={TIPOS_MOV[m.tipo]?.dir > 0 ? "success" : TIPOS_MOV[m.tipo]?.dir < 0 ? "danger" : "info"} label={TIPOS_MOV[m.tipo]?.label || m.tipo} showDot={false} /> },
    { field: "producto", headerName: "Producto", width: "26%", renderCell: (m) => <Box><strong>{productoDe(m.producto_id)?.nombre || `#${m.producto_id}`}</strong>{m.pres_label && <Typography variant="caption" color="text.secondary" display="block">{m.pres_label}</Typography>}</Box> },
    { field: "sucursal", headerName: "Sucursal", renderCell: (m) => <span>{sucursalDe(m.sucursal_id)?.nombre || "—"}{m.sucursal_destino_id ? ` → ${sucursalDe(m.sucursal_destino_id)?.nombre || ""}` : ""}</span> },
    { field: "cantidad", headerName: "Cantidad", align: "right", renderCell: (m) => <span className={`inv-mov-qty ${m.signo > 0 ? "inv-mov-qty--pos" : m.signo < 0 ? "inv-mov-qty--neg" : "inv-mov-qty--neutral"}`}>{m.signo > 0 ? "+" : m.signo < 0 ? "−" : "±"}{num(m.cantidad)} {m.unidad}</span> },
    { field: "estados", headerName: "Estado", sortable: false, renderCell: (m) => <span className="text-tertiary nowrap">{[m.estado_desde && (ESTADOS_STOCK[m.estado_desde]?.label || m.estado_desde), m.estado_hacia && (ESTADOS_STOCK[m.estado_hacia]?.label || m.estado_hacia)].filter(Boolean).join(" → ") || "—"}</span> },
    { field: "descripcion", headerName: "Detalle", width: "24%", renderCell: (m) => <span className="inv-mov-ref">{m.descripcion || m.motivo || "—"}</span> },
    { field: "usuario", headerName: "Quién", renderCell: (m) => <span className="text-tertiary">{m.usuario_id ? nombreUsuario(m.usuario_id) : "—"}</span> },
  ];

  return (
    <Box className="page fade-in">
      <PageHeader title="Movimientos" subtitle="El kardex. Nada se edita ni se borra: cada operación deja su rastro con quién, cuánto y por qué." />
      <Box className="table-tabs">
        <TextField select size="small" label="Tipo" value={q.tipo} onChange={(e) => setQ({ ...q, tipo: e.target.value })} sx={{ minWidth: 170 }}>
          <MenuItem value="">Todos</MenuItem>
          {Object.entries(TIPOS_MOV).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}
        </TextField>
        {esJefe && (
          <TextField select size="small" label="Sucursal" value={q.sucursalId} onChange={(e) => setQ({ ...q, sucursalId: e.target.value })} sx={{ minWidth: 170 }}>
            <MenuItem value="">Todas</MenuItem>
            {(sucursales.data || []).map((s) => <MenuItem key={s.id} value={s.id}>{s.nombre}</MenuItem>)}
          </TextField>
        )}
        <TextField select size="small" label="Producto" value={q.productoId} onChange={(e) => setQ({ ...q, productoId: e.target.value })} sx={{ minWidth: 220 }}>
          <MenuItem value="">Todos</MenuItem>
          {(productos.data || []).map((p) => <MenuItem key={p.id} value={p.id}>{p.nombre}</MenuItem>)}
        </TextField>
        <TextField size="small" type="date" label="Desde" value={q.desde} onChange={(e) => setQ({ ...q, desde: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField size="small" type="date" label="Hasta" value={q.hasta} onChange={(e) => setQ({ ...q, hasta: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
      </Box>
      <DataTable columns={columns} data={(movimientos.data || []).map((m) => ({ ...m, id: m.id }))} loading={movimientos.isLoading} emptyMessage="Sin movimientos con ese filtro." pagination={{ pageSize: 50 }} />
    </Box>
  );
};

export default Movimientos;
