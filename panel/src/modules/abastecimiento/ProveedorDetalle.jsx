/** La ficha de un proveedor: datos comerciales, los productos que trae y el rastro de cambios. */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";

import EntityHeader from "../../components/EntityHeader/EntityHeader";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { useEntityLabel } from "../../components/Breadcrumbs/EntityLabelContext";
import { QK } from "../../app/api/queryClient";
import { proveedoresApi, CONDICION_IVA, CONDICION_COMPRA, PROVEEDOR_VACIO, aPayload } from "./api/proveedoresApi";
import ProveedorForm from "./components/ProveedorForm";
import { productosApi, money, num } from "../productos/api/productosApi";
import { useEstadoDesde } from "../../hooks/useEstadoDesde";
import PercepcionesYCuentas from "./components/PercepcionesYCuentas";
import "./ProveedorDetalle.css";

const stamp = (iso) => (iso ? new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

const ProveedorDetalle = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { check, can } = useAuth();
  const qc = useQueryClient();
  const puede = check("compras.proveedores").allowed;
  const veCostos = can("precios", "compras.productos", "compras.proveedores");
  const [tab, setTab] = useState(0);

  const proveedor = useQuery({ queryKey: QK.proveedor(id), queryFn: () => proveedoresApi.get(id) });
  // El formulario arranca de la ficha cargada; si la ficha cambia (se guardó o refrescó), se vuelve a armar.
  const [form, setForm] = useEstadoDesde(proveedor.data, (x) => (x ? { ...PROVEEDOR_VACIO, ...x, diasPago: x.diasPago ?? "", medioHabitual: x.medioHabitual ?? "", letraGasto: x.letraGasto ?? "" } : PROVEEDOR_VACIO));
  const productos = useQuery({ queryKey: QK.productos, queryFn: productosApi.listar });
  const auditoria = useQuery({ queryKey: QK.auditoria("proveedor", id), queryFn: () => proveedoresApi.auditoria(id), enabled: tab === 3 });
  const costos = useQuery({ queryKey: QK.precios.historial({ proveedorId: Number(id) }), queryFn: () => proveedoresApi.historialCostos(id), enabled: tab === 3 && veCostos });

  const p = proveedor.data;
  const { setLabel } = useEntityLabel();
  useEffect(() => { if (p?.nombre) setLabel(id, p.nombre); }, [id, p?.nombre, setLabel]);

  const guardar = useMutation({
    mutationFn: (body) => proveedoresApi.editar(id, aPayload(body)),
    onSuccess: () => { showToast("Ficha guardada.", "success"); qc.invalidateQueries({ queryKey: QK.proveedor(id) }); qc.invalidateQueries({ queryKey: QK.proveedores }); qc.invalidateQueries({ queryKey: QK.auditoria("proveedor", id) }); },
    onError: (err) => showToast(err?.message || "No se pudo guardar.", "error"),
  });
  const borrar = useMutation({
    mutationFn: () => proveedoresApi.borrar(id),
    onSuccess: () => { showToast("Proveedor borrado.", "info"); qc.invalidateQueries({ queryKey: QK.proveedores }); navigate("/abastecimiento/proveedores"); },
    onError: (err) => showToast(err?.message || "No se pudo borrar.", "error"),
  });

  /** Los productos que este proveedor trae, con el formato de compra que le corresponde. */
  const catalogo = useMemo(() => (productos.data || []).flatMap((prod) => (prod.formatosCompra || [])
    .filter((f) => f.proveedorId === Number(id))
    .map((f) => ({ id: f.id, producto: prod, formato: f }))), [productos.data, id]);

  if (proveedor.isLoading) return <div className="route-loading" aria-busy="true" />;
  if (!p) return <Box className="page"><Typography>Proveedor inexistente.</Typography></Box>;

  return (
    <Box className="page fade-in">
      <EntityHeader
        eyebrow={`${CONDICION_IVA[p.condicionIva] || ""}${p.cuit ? ` · CUIT ${p.cuit}` : ""}`}
        title={p.nombre}
        subtitle={[p.direccion, p.telefono, p.email].filter(Boolean).join(" · ") || "Sin datos de contacto"}
        badges={<><StatusBadge tone={p.condicionCompra === "factura" ? "success" : "warning"} label={CONDICION_COMPRA[p.condicionCompra]} showDot={false} />{p.proveeMercaderia && <StatusBadge tone="info" label="Mercadería" showDot={false} />}{p.proveeGastos && <StatusBadge tone="neutral" label="Gastos" showDot={false} />}</>}
        onBack={() => navigate("/abastecimiento/proveedores")}
        actions={(<Box sx={{ display: "flex", gap: 1 }}>{can("proveedores.edoc") && <Button size="small" variant="secondary" onClick={() => navigate(`/abastecimiento/cuentas/${id}`)}>Estado de cuenta</Button>}{can("facturas") && <Button size="small" variant="primary" onClick={() => navigate(`/abastecimiento/compras/nuevo?proveedorId=${id}`)}>Cargar comprobante</Button>}{puede && <Button size="small" variant="danger" disabled={catalogo.length > 0} onClick={() => { if (window.confirm("¿Borrar el proveedor?")) borrar.mutate(); }}>Borrar</Button>}</Box>)}
      />

      <Tabs value={tab} onChange={(_, v) => setTab(v)} className="sup-tabs" sx={{ mb: 2 }}>
        <Tab label="Ficha" />
        <Tab label={`Productos que trae (${catalogo.length})`} />
        <Tab label="Percepciones y cuentas" />
        <Tab label="Historial" />
      </Tabs>

      {tab === 0 && (
        <Card className="entity-card">
          <ProveedorForm value={form} onChange={setForm} disabled={!puede} />
          {puede && <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}><Button variant="primary" loading={guardar.isPending} onClick={() => guardar.mutate(form)}>Guardar ficha</Button></Box>}
        </Card>
      )}

      {tab === 1 && (
        <DataTable
          columns={[
            { field: "producto", headerName: "Producto", renderCell: (r) => <Box className="sup-catalog-cell"><strong>{r.producto.nombre}</strong><Typography variant="caption" color="text.secondary" display="block">{r.producto.codigoPropio}{r.formato.codigoProveedor ? ` · cód. prov. ${r.formato.codigoProveedor}` : ""}</Typography></Box> },
            { field: "activo", headerName: "Fija el precio", renderCell: (r) => (r.formato.usarParaPrecio ? <span className="sup-preferred-star">★ activo</span> : <span className="text-tertiary">—</span>) },
            { field: "bulto", headerName: "Bulto", align: "right", renderCell: (r) => `×${num(r.formato.cantidad)}` },
            ...(veCostos ? [
              { field: "costo", headerName: "Costo bulto", align: "right", renderCell: (r) => money(r.formato.costo) },
              { field: "neto", headerName: "Neto unitario", align: "right", renderCell: (r) => <strong>{money(r.formato.costoNetoUnitario)}</strong> },
            ] : []),
            { field: "precio", headerName: "Mostrador", align: "right", renderCell: (r) => money(r.producto.precioFinal) },
          ]}
          data={catalogo}
          loading={productos.isLoading}
          emptyMessage="Todavía no le compramos nada: los formatos de compra se cargan en la ficha de cada producto."
          onRowClick={(r) => navigate(`/productos/${r.producto.id}`)}
        />
      )}

      {tab === 2 && <PercepcionesYCuentas proveedorId={id} puede={puede} />}

      {tab === 3 && (
        <Box sx={{ display: "grid", gap: 2 }}>
          <Card className="entity-card">
            <Typography className="card-title" sx={{ mb: 1 }}>Cambios en la ficha y los formatos</Typography>
            <DataTable
              columns={[
                { field: "fecha", headerName: "Fecha", renderCell: (a) => <span className="nowrap">{stamp(a.fecha)}</span> },
                { field: "ambito", headerName: "Dónde", renderCell: (a) => <span>{a.ambito}{a.detalle ? <span className="text-tertiary"> · {a.detalle}</span> : ""}</span> },
                { field: "campo", headerName: "Campo" },
                { field: "antes", headerName: "Antes", renderCell: (a) => <span className="text-tertiary">{a.antes || "—"}</span> },
                { field: "despues", headerName: "Después", renderCell: (a) => <strong>{a.despues || "—"}</strong> },
                { field: "usuario", headerName: "Quién", renderCell: (a) => <span className="text-tertiary">{a.usuario || "—"}</span> },
              ]}
              data={auditoria.data || []}
              loading={auditoria.isLoading}
              emptyMessage="Sin cambios registrados."
            />
          </Card>
          {veCostos && (
            <Card className="entity-card">
              <Typography className="card-title" sx={{ mb: 1 }}>Cambios de costo</Typography>
              <DataTable
                columns={[
                  { field: "fecha", headerName: "Fecha", renderCell: (h) => <span className="nowrap">{stamp(h.fecha)}</span> },
                  { field: "producto", headerName: "Producto" },
                  { field: "costoAnterior", headerName: "Antes", align: "right", renderCell: (h) => money(h.costoAnterior) },
                  { field: "costo", headerName: "Después", align: "right", renderCell: (h) => <strong>{money(h.costo)}</strong> },
                  { field: "origen", headerName: "Origen", renderCell: (h) => <StatusBadge tone="info" label={h.origen} showDot={false} /> },
                  { field: "usuario", headerName: "Quién", renderCell: (h) => <span className="text-tertiary">{h.usuario || "—"}</span> },
                ]}
                data={costos.data || []}
                loading={costos.isLoading}
                emptyMessage="Sin cambios de costo."
              />
            </Card>
          )}
        </Box>
      )}
    </Box>
  );
};

export default ProveedorDetalle;
