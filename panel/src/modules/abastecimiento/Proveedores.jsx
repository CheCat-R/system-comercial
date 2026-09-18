/** El padrón de proveedores, contra la API. */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import InputAdornment from "@mui/material/InputAdornment";
import Tooltip from "@mui/material/Tooltip";

import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/Add";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";
import useVistaGuardada from "../../hooks/useVistaGuardada";
import { QK } from "../../app/api/queryClient";
import { proveedoresApi, CONDICION_IVA, CONDICION_COMPRA, PROVEEDOR_VACIO, aPayload } from "./api/proveedoresApi";
import ProveedorForm from "./components/ProveedorForm";
import "./Proveedores.css";

const Proveedores = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { check } = useAuth();
  const qc = useQueryClient();
  const puede = check("compras.proveedores");

  const { filtros, setFiltros } = useVistaGuardada("proveedores", { search: "", tipo: "" });
  const { search, tipo } = filtros;
  const [alta, setAlta] = useState(null);

  const proveedores = useQuery({ queryKey: QK.proveedores, queryFn: () => proveedoresApi.listar() });

  const crear = useMutation({
    mutationFn: (body) => proveedoresApi.crear(aPayload(body)),
    onSuccess: (p) => { showToast(`"${p.nombre}" creado.`, "success"); qc.invalidateQueries({ queryKey: QK.proveedores }); setAlta(null); navigate(`/abastecimiento/proveedores/${p.id}`); },
    onError: (err) => showToast(err?.message || "No se pudo crear.", "error"),
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (proveedores.data || []).filter((p) => {
      if (tipo === "mercaderia" && !p.proveeMercaderia) return false;
      if (tipo === "gastos" && !p.proveeGastos) return false;
      if (q && ![p.nombre, p.cuit, p.email].some((v) => String(v || "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [proveedores.data, search, tipo]);

  const columns = [
    {
      field: "nombre", headerName: "Proveedor", width: "34%",
      renderCell: (p) => (
        <Box className="prov-cell">
          <Avatar variant="rounded" className="prov-cell__avatar"><BusinessOutlinedIcon fontSize="small" /></Avatar>
          <Box>
            <Typography className="prov-cell__name">{p.nombre}</Typography>
            <Typography className="prov-cell__contact">{p.cuit || "sin CUIT"}{p.email ? ` · ${p.email}` : ""}{p.telefono ? ` · ${p.telefono}` : ""}</Typography>
          </Box>
        </Box>
      ),
    },
    { field: "condicionIva", headerName: "IVA", renderCell: (p) => <span className="text-tertiary">{CONDICION_IVA[p.condicionIva] || "—"}</span> },
    { field: "condicionCompra", headerName: "Emite", renderCell: (p) => <StatusBadge tone={p.condicionCompra === "factura" ? "success" : "warning"} label={CONDICION_COMPRA[p.condicionCompra] || p.condicionCompra} showDot={false} /> },
    { field: "provee", headerName: "Provee", sortable: false, renderCell: (p) => <span>{[p.proveeMercaderia && "Mercadería", p.proveeGastos && "Gastos"].filter(Boolean).join(" · ") || "—"}</span> },
    { field: "productosCargados", headerName: "Productos", align: "right" },
    { field: "diasPago", headerName: "Plazo", align: "right", renderCell: (p) => (p.diasPago ? `${p.diasPago} d` : "—") },
  ];

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Proveedores"
        subtitle="La ficha comercial: qué documento emite, cómo se le paga y a cuántos días. Lo operativo (formatos de compra y costos) vive en cada producto."
        actions={(
          <Tooltip title={puede.allowed ? "" : puede.reason}>
            <span><Button variant="primary" startIcon={<AddIcon />} disabled={!puede.allowed} onClick={() => setAlta({ ...PROVEEDOR_VACIO })}>Nuevo proveedor</Button></span>
          </Tooltip>
        )}
      />
      <Box className="table-toolbar">
        <TextField size="small" className="table-toolbar__search" placeholder="Buscar por nombre, CUIT o email…" value={search} onChange={(e) => setFiltros({ search: e.target.value })}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
        <Box className="table-toolbar__filters">
          <TextField select size="small" label="Provee" value={tipo} onChange={(e) => setFiltros({ tipo: e.target.value })} sx={{ minWidth: 160 }}>
            <MenuItem value="">Todos</MenuItem>
            <MenuItem value="mercaderia">Mercadería</MenuItem>
            <MenuItem value="gastos">Gastos</MenuItem>
          </TextField>
        </Box>
      </Box>
      <DataTable columns={columns} data={rows} loading={proveedores.isLoading} emptyMessage="Ningún proveedor todavía." onRowClick={(p) => navigate(`/abastecimiento/proveedores/${p.id}`)} pagination={{ pageSize: 25 }} />

      <Modal open={Boolean(alta)} onClose={() => setAlta(null)} title="Nuevo proveedor" maxWidth="md"
        actions={(<><Button variant="ghost" onClick={() => setAlta(null)}>Cancelar</Button><Button variant="primary" loading={crear.isPending} onClick={() => { if (!alta.nombre.trim()) { showToast("Poné el nombre.", "warning"); return; } crear.mutate(alta); }}>Crear</Button></>)}>
        {alta && <ProveedorForm value={alta} onChange={setAlta} />}
      </Modal>
    </Box>
  );
};

export default Proveedores;
