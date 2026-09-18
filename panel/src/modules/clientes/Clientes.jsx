/**
 * CLIENTES contra la API. El padrón que consumen el POS, los presupuestos y
 * las cobranzas: identidad fiscal (define la letra del comprobante), listas
 * asignadas, descuento y crédito. Un cliente con historial nunca se borra.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Tooltip from "@mui/material/Tooltip";
import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/Add";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { ventasApi, CONDICIONES_IVA, TIPOS_DOC, money, norm } from "../ventas/api/ventasApi";
import ClienteForm from "./components/ClienteForm";
import { CLIENTE_VACIO, aPayloadCliente } from "./lib/fichaCliente";
import "./Clientes.css";

const TABS = [{ key: "activos", label: "Activos" }, { key: "ctacte", label: "Con cuenta corriente" }, { key: "inactivos", label: "Inactivos" }, { key: "", label: "Todos" }];

const Clientes = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { can, check } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState(0);
  const [q, setQ] = useState("");
  const [nuevo, setNuevo] = useState(null);
  const puede = check("ventas.clientes");
  const puedeCredito = can("cta_cte");

  const lista = useQuery({ queryKey: ["clientes"], queryFn: () => ventasApi.clientes.listar() });
  const boot = useQuery({ queryKey: ["ventas", "bootstrap"], queryFn: ventasApi.bootstrap, staleTime: 60_000 });
  const mCrear = useMutation({
    mutationFn: (b) => ventasApi.clientes.crear(b),
    onSuccess: (c) => { showToast(`${c.nombre} creado.`, "success"); setNuevo(null); qc.invalidateQueries({ queryKey: ["clientes"] }); qc.invalidateQueries({ queryKey: ["ventas", "bootstrap"] }); navigate(`/clientes/${c.id}`); },
    onError: (e) => showToast(e?.message || "No se pudo crear.", "error"),
  });

  const rows = useMemo(() => {
    const t = norm(q);
    return (lista.data || []).filter((c) => {
      const k = TABS[tab].key;
      if (k === "activos" && !c.activo) return false;
      if (k === "inactivos" && c.activo) return false;
      if (k === "ctacte" && !c.ctaCteHabilitada) return false;
      return !t || norm(`${c.nombre} ${c.nombreFantasia} ${c.numeroDoc} ${c.localidad}`).includes(t);
    });
  }, [lista.data, tab, q]);

  const columns = [
    { field: "nombre", headerName: "Cliente", renderCell: (c) => <Box className="cliente-cell"><Box><strong>{c.nombre}</strong>{c.nombreFantasia && <Typography variant="caption" display="block" color="text.secondary">{c.nombreFantasia}</Typography>}</Box></Box> },
    { field: "numeroDoc", headerName: "Documento", renderCell: (c) => (c.numeroDoc ? `${TIPOS_DOC[c.tipoDoc] || c.tipoDoc} ${c.numeroDoc}` : <span className="text-tertiary">—</span>) },
    { field: "condicionIva", headerName: "IVA", renderCell: (c) => CONDICIONES_IVA[c.condicionIva]?.corto || c.condicionIva },
    { field: "localidad", headerName: "Localidad", renderCell: (c) => <span className="text-tertiary">{c.localidad || "—"}{c.telefono ? ` · ${c.telefono}` : ""}</span> },
    { field: "descuento", headerName: "Desc.", align: "right", renderCell: (c) => (c.descuento > 0 ? `${c.descuento}%` : <span className="text-tertiary">—</span>) },
    { field: "limiteCredito", headerName: "Crédito", align: "right", renderCell: (c) => (c.ctaCteHabilitada ? (c.limiteCredito > 0 ? money(c.limiteCredito) : "sin tope") : <span className="text-tertiary">—</span>) },
    { field: "activo", headerName: "Estado", renderCell: (c) => <StatusBadge tone={c.esConsumidorFinal ? "info" : c.activo ? "success" : "neutral"} label={c.esConsumidorFinal ? "Genérico" : c.activo ? "Activo" : "Inactivo"} /> },
  ];

  return (
    <Box className="page fade-in">
      <PageHeader title="Clientes" subtitle="El padrón del mostrador: la condición fiscal define la letra del comprobante; las listas y el descuento, el precio; el crédito, la cuenta corriente."
        actions={<Tooltip title={puede.allowed ? "" : puede.reason}><span><Button variant="primary" startIcon={<AddIcon />} disabled={!puede.allowed} onClick={() => setNuevo({ ...CLIENTE_VACIO })}>Nuevo cliente</Button></span></Tooltip>} />
      <Box className="table-tabs">
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>{TABS.map((t) => <Tab key={t.key} label={t.label} />)}</Tabs>
        <TextField size="small" placeholder="Buscar por nombre, documento o localidad…" value={q} onChange={(e) => setQ(e.target.value)} sx={{ minWidth: 300 }} slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
      </Box>
      <DataTable columns={columns} data={rows} loading={lista.isLoading} emptyMessage="Sin clientes." onRowClick={(c) => navigate(`/clientes/${c.id}`)} pagination={{ pageSize: 25 }} />

      <Modal open={Boolean(nuevo)} onClose={() => setNuevo(null)} title="Nuevo cliente" maxWidth="md"
        actions={(<><Button variant="ghost" onClick={() => setNuevo(null)}>Cancelar</Button><Button variant="primary" loading={mCrear.isPending} disabled={!nuevo?.nombre?.trim()} onClick={() => mCrear.mutate(aPayloadCliente(nuevo, puedeCredito))}>Crear</Button></>)}>
        {nuevo && <ClienteForm valor={nuevo} onChange={setNuevo} listas={boot.data?.listasCatalogo?.listas || []} usuarios={boot.data?.usuarios || []} sucursales={boot.data?.sucursales || []} puedeCredito={puedeCredito} />}
      </Modal>
    </Box>
  );
};

export default Clientes;
