/**
 * Un catálogo del producto (marcas, categorías+subcategorías, etiquetas)
 * contra la API. Los tres comparten la misma mecánica: se crean, se
 * renombran, se dan de baja si tienen usos (o se borran si no) y se pueden
 * FUSIONAR: "Cachafaz" y "CACHAFAZ" eran dos marcas y ahora son una.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/Add";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import CallMergeOutlinedIcon from "@mui/icons-material/CallMergeOutlined";

import PageHeader from "../../../components/PageHeader/PageHeader";
import Button from "../../../components/Button/Button";
import DataTable from "../../../components/DataTable/DataTable";
import Modal from "../../../components/Modal/Modal";
import StatusBadge from "../../../components/StatusBadge/StatusBadge";
import { useToast } from "../../../components/Toast/ToastContext";
import { useAuth } from "../../../context/AuthContext";
import { QK } from "../../../app/api/queryClient";
import { productosApi } from "../api/productosApi";

const CatalogoGenerico = ({ tipo, titulo, subtitulo, singular, conCategoria = false, conColor = false }) => {
  const { showToast } = useToast();
  const { check } = useAuth();
  const qc = useQueryClient();
  const puede = check("compras.catalogos");

  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);   // { id?, nombre, categoriaId?, color?, activa }
  const [fusion, setFusion] = useState(null); // { desde, haciaId }

  const catalogos = useQuery({ queryKey: QK.catalogos, queryFn: productosApi.catalogos });
  const productos = useQuery({ queryKey: QK.productos, queryFn: productosApi.listar });

  const filas = useMemo(() => catalogos.data?.[tipo] || [], [catalogos.data, tipo]);
  const categorias = catalogos.data?.categorias || [];

  /** Cuántos productos usan cada ítem. */
  const usos = useMemo(() => {
    const m = {};
    const campo = { marcas: "marcaId", categorias: "categoriaId", subcategorias: "subcategoriaId" }[tipo];
    (productos.data || []).forEach((p) => {
      if (tipo === "etiquetas") (p.etiquetas || []).forEach((id) => { m[id] = (m[id] || 0) + 1; });
      else if (campo && p[campo]) m[p[campo]] = (m[p[campo]] || 0) + 1;
    });
    return m;
  }, [productos.data, tipo]);

  const invalidar = () => { qc.invalidateQueries({ queryKey: QK.catalogos }); qc.invalidateQueries({ queryKey: QK.productos }); };
  const err = (e) => showToast(e?.message || "No se pudo guardar.", "error");

  const guardar = useMutation({
    mutationFn: (m) => (m.id ? productosApi.editarCatalogo(tipo, m.id, m) : productosApi.crearCatalogo(tipo, m)),
    onSuccess: () => { showToast(`${singular} guardada.`, "success"); invalidar(); setModal(null); }, onError: err,
  });
  const borrar = useMutation({
    mutationFn: (id) => productosApi.borrarCatalogo(tipo, id),
    onSuccess: (r) => { showToast(r?.desactivada ? `Tiene usos (${r.detalle}): quedó desactivada.` : `${singular} borrada.`, r?.desactivada ? "warning" : "info"); invalidar(); }, onError: err,
  });
  const fusionar = useMutation({
    mutationFn: ({ desde, haciaId }) => productosApi.fusionarCatalogo(tipo, desde.id, Number(haciaId)),
    onSuccess: (r) => { showToast(`Fusionado en "${r.destino?.nombre}".`, "success"); invalidar(); setFusion(null); }, onError: err,
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return filas.filter((f) => !q || f.nombre.toLowerCase().includes(q)).map((f) => ({ ...f, usos: usos[f.id] || 0 }));
  }, [filas, search, usos]);

  const columns = [
    { field: "nombre", headerName: singular, renderCell: (f) => (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        {conColor && <span style={{ width: 12, height: 12, borderRadius: 3, background: f.color || "var(--border-default)", display: "inline-block" }} />}
        <strong>{f.nombre}</strong>
      </Box>
    ) },
    ...(conCategoria ? [{ field: "categoriaId", headerName: "Categoría", renderCell: (f) => categorias.find((c) => c.id === f.categoriaId)?.nombre || "—" }] : []),
    { field: "usos", headerName: "Productos", align: "right" },
    { field: "activa", headerName: "Estado", renderCell: (f) => <StatusBadge status={f.activa ? "activa" : "inactiva"} label={f.activa ? "Activa" : "Dada de baja"} /> },
    {
      field: "acciones", headerName: "", align: "right", sortable: false,
      renderCell: (f) => puede.allowed && (
        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <Tooltip title="Renombrar"><IconButton size="small" onClick={(e) => { e.stopPropagation(); setModal({ id: f.id, nombre: f.nombre, categoriaId: f.categoriaId ?? "", color: f.color ?? "", activa: f.activa }); }}><EditOutlinedIcon fontSize="small" /></IconButton></Tooltip>
          <Tooltip title="Fusionar en otra"><IconButton size="small" onClick={(e) => { e.stopPropagation(); setFusion({ desde: f, haciaId: "" }); }}><CallMergeOutlinedIcon fontSize="small" /></IconButton></Tooltip>
          <Tooltip title={f.usos ? "Tiene usos: se da de baja" : "Borrar"}><IconButton size="small" onClick={(e) => { e.stopPropagation(); borrar.mutate(f.id); }}><DeleteOutlineOutlinedIcon fontSize="small" /></IconButton></Tooltip>
        </Box>
      ),
    },
  ];

  const destinos = filas.filter((f) => f.id !== fusion?.desde?.id && (!conCategoria || f.categoriaId === fusion?.desde?.categoriaId));

  return (
    <Box className="page fade-in">
      <PageHeader title={titulo} subtitle={subtitulo}
        actions={(
          <Tooltip title={puede.allowed ? "" : puede.reason}>
            <span><Button variant="primary" startIcon={<AddIcon />} disabled={!puede.allowed} onClick={() => setModal({ nombre: "", categoriaId: categorias[0]?.id ?? "", color: "", activa: true })}>Nueva {singular.toLowerCase()}</Button></span>
          </Tooltip>
        )} />
      <Box className="table-toolbar">
        <TextField size="small" className="table-toolbar__search" placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
      </Box>
      <DataTable columns={columns} data={rows} loading={catalogos.isLoading} emptyMessage="Nada por acá todavía." />

      <Modal open={Boolean(modal)} onClose={() => setModal(null)} title={modal?.id ? `Editar ${singular.toLowerCase()}` : `Nueva ${singular.toLowerCase()}`}
        actions={(<><Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button><Button variant="primary" loading={guardar.isPending} onClick={() => guardar.mutate(modal)}>Guardar</Button></>)}>
        {modal && (
          <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
            <TextField label="Nombre" size="small" autoFocus value={modal.nombre} onChange={(e) => setModal({ ...modal, nombre: e.target.value })} />
            {conCategoria && (
              <TextField select label="Categoría" size="small" value={modal.categoriaId} onChange={(e) => setModal({ ...modal, categoriaId: e.target.value })}>
                {categorias.map((c) => <MenuItem key={c.id} value={c.id}>{c.nombre}</MenuItem>)}
              </TextField>
            )}
            {conColor && <TextField label="Color" size="small" type="color" value={modal.color || "#4f46e5"} onChange={(e) => setModal({ ...modal, color: e.target.value })} sx={{ width: 120 }} />}
            {modal.id && (
              <TextField select label="Estado" size="small" value={modal.activa ? "1" : "0"} onChange={(e) => setModal({ ...modal, activa: e.target.value === "1" })}>
                <MenuItem value="1">Activa</MenuItem><MenuItem value="0">Dada de baja</MenuItem>
              </TextField>
            )}
          </Box>
        )}
      </Modal>

      <Modal open={Boolean(fusion)} onClose={() => setFusion(null)} title={`Fusionar "${fusion?.desde?.nombre}"`}
        subtitle="Todo lo que apunta a esta pasa a la elegida, y esta se borra. No se deshace."
        actions={(<><Button variant="ghost" onClick={() => setFusion(null)}>Cancelar</Button><Button variant="danger" loading={fusionar.isPending} disabled={!fusion?.haciaId} onClick={() => fusionar.mutate(fusion)}>Fusionar</Button></>)}>
        {fusion && (
          <TextField select fullWidth label="Fusionar en" size="small" value={fusion.haciaId} onChange={(e) => setFusion({ ...fusion, haciaId: e.target.value })} sx={{ mt: 1 }}>
            {destinos.map((d) => <MenuItem key={d.id} value={d.id}>{d.nombre}</MenuItem>)}
          </TextField>
        )}
        {fusion && !destinos.length && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>No hay otra con la que fusionar.</Typography>}
      </Modal>
    </Box>
  );
};

export default CatalogoGenerico;
