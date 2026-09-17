/**
 * Control de stock: el físico contra el virtual. Se abre una sesión con un
 * alcance (todo, una marca, una categoría, un proveedor…), se cuenta, se
 * cierra —la foto final— y quien tiene la llave revisa y APLICA los ajustes.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
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
import { inventarioApi, ESTADOS_CONTEO, stamp } from "./api/inventarioApi";
import { productosApi } from "../productos/api/productosApi";
import { useInventarioBase } from "./hooks/useInventario";
import "./InventarioFisico.css";

const InventarioFisico = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user, esJefe, check, can } = useAuth();
  const qc = useQueryClient();
  const { sucursales, sucursalDe } = useInventarioBase();
  const puedeAplicar = can("conteos_aplicar");
  const puede = check("almacen.conteos");

  const [nuevo, setNuevo] = useState(null);
  const conteos = useQuery({ queryKey: QK.conteos, queryFn: () => inventarioApi.conteos.listar() });
  const catalogos = useQuery({ queryKey: QK.catalogos, queryFn: productosApi.catalogos, enabled: Boolean(nuevo) });
  const proveedores = useQuery({ queryKey: QK.proveedores, queryFn: () => productosApi.proveedores("mercaderia"), enabled: Boolean(nuevo) });

  const crear = useMutation({
    mutationFn: (b) => inventarioApi.conteos.crear(b),
    onSuccess: (c) => { showToast(`Control abierto con ${c.total} renglones.`, "success"); qc.invalidateQueries({ queryKey: QK.conteos }); setNuevo(null); navigate(`/inventario/fisico/${c.id}`); },
    onError: (err) => showToast(err?.message || "No se pudo abrir el control.", "error"),
  });

  const columns = [
    { field: "nombre", headerName: "Control", renderCell: (c) => <Box><strong>{c.nombre || `#${c.id}`}</strong><span className="text-tertiary" style={{ display: "block", fontSize: "0.78rem" }}>{c.alcance}</span></Box> },
    { field: "sucursal_id", headerName: "Sucursal", renderCell: (c) => sucursalDe(c.sucursal_id)?.nombre || "—" },
    { field: "created_at", headerName: "Abierto", renderCell: (c) => <span className="nowrap">{stamp(c.created_at)}</span> },
    { field: "progreso", headerName: "Progreso", sortable: false, renderCell: (c) => <span className="inv-num">{c.contados}/{c.total}{c.aRecontar ? ` · ${c.aRecontar} a recontar` : ""}</span> },
    { field: "ciego", headerName: "Modo", renderCell: (c) => <span className="text-tertiary">{c.ciego ? "Ciego" : "A la vista"}</span> },
    { field: "estado", headerName: "Estado", renderCell: (c) => <StatusBadge tone={ESTADOS_CONTEO[c.estado]?.tone} label={ESTADOS_CONTEO[c.estado]?.label || c.estado} /> },
  ];

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Control de stock"
        subtitle="Contar lo físico y compararlo con lo que dice el sistema. Un renglón no puede estar en dos controles vivos a la vez."
        actions={(
          <Tooltip title={puede.allowed ? "" : puede.reason}><span>
            <Button variant="primary" startIcon={<AddIcon />} disabled={!puede.allowed} onClick={() => setNuevo({ nombre: "", sucursalId: user?.sucursalId ?? "", ciego: true, marcaId: "", categoriaId: "", proveedorId: "", tipo: "", soloConStock: true, incluirArchivados: false })}>Nuevo control</Button>
          </span></Tooltip>
        )}
      />
      <DataTable columns={columns} data={(conteos.data || []).map((c) => ({ ...c, id: c.id }))} loading={conteos.isLoading} emptyMessage="Sin controles todavía." onRowClick={(c) => navigate(`/inventario/fisico/${c.id}`)} />

      <Modal open={Boolean(nuevo)} onClose={() => setNuevo(null)} title="Nuevo control de stock" subtitle="El alcance decide qué se cuenta. Ciego = el que cuenta no ve el virtual (evita 'contar lo que dice la pantalla')."
        actions={(<><Button variant="ghost" onClick={() => setNuevo(null)}>Cancelar</Button><Button variant="primary" loading={crear.isPending} onClick={() => crear.mutate({ ...nuevo, sucursalId: Number(nuevo.sucursalId), marcaId: nuevo.marcaId || undefined, categoriaId: nuevo.categoriaId || undefined, proveedorId: nuevo.proveedorId || undefined, tipo: nuevo.tipo || undefined })}>Abrir</Button></>)}>
        {nuevo && (
          <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
            <TextField size="small" label="Nombre (opcional)" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
            <TextField select size="small" label="Sucursal" value={nuevo.sucursalId} onChange={(e) => setNuevo({ ...nuevo, sucursalId: e.target.value })} disabled={!esJefe}>
              {(sucursales.data || []).map((s) => <MenuItem key={s.id} value={s.id}>{s.nombre}</MenuItem>)}
            </TextField>
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
              <TextField select size="small" label="Marca" value={nuevo.marcaId} onChange={(e) => setNuevo({ ...nuevo, marcaId: e.target.value })}><MenuItem value="">Todas</MenuItem>{(catalogos.data?.marcas || []).map((m) => <MenuItem key={m.id} value={m.id}>{m.nombre}</MenuItem>)}</TextField>
              <TextField select size="small" label="Categoría" value={nuevo.categoriaId} onChange={(e) => setNuevo({ ...nuevo, categoriaId: e.target.value })}><MenuItem value="">Todas</MenuItem>{(catalogos.data?.categorias || []).map((c) => <MenuItem key={c.id} value={c.id}>{c.nombre}</MenuItem>)}</TextField>
              <TextField select size="small" label="Proveedor" value={nuevo.proveedorId} onChange={(e) => setNuevo({ ...nuevo, proveedorId: e.target.value })}><MenuItem value="">Todos</MenuItem>{(proveedores.data || []).map((p) => <MenuItem key={p.id} value={p.id}>{p.nombre}</MenuItem>)}</TextField>
              <TextField select size="small" label="Tipo" value={nuevo.tipo} onChange={(e) => setNuevo({ ...nuevo, tipo: e.target.value })}><MenuItem value="">Todos</MenuItem><MenuItem value="entero">Solo enteros</MenuItem><MenuItem value="granel">Solo granel</MenuItem></TextField>
            </Box>
            <FormControlLabel control={<Switch checked={nuevo.soloConStock} onChange={(e) => setNuevo({ ...nuevo, soloConStock: e.target.checked })} />} label="Sólo lo que tiene stock" />
            <FormControlLabel control={<Switch checked={nuevo.ciego} onChange={(e) => setNuevo({ ...nuevo, ciego: e.target.checked })} disabled={!puedeAplicar} />} label={`Ciego${!puedeAplicar ? " (sólo quien aplica elige contar a la vista)" : ""}`} />
          </Box>
        )}
      </Modal>
    </Box>
  );
};

export default InventarioFisico;
