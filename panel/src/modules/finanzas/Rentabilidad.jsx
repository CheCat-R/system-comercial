/**
 * RENTABILIDAD — el margen de verdad. Separa lo que PARECE que se gana de lo
 * que se gana: la diferencia es el IVA que el negocio absorbe por la
 * mercadería comprada sin factura — al facturar la venta ese IVA se paga
 * igual, y no hay crédito que lo compense.
 *
 * Todo el margen sale del costo CONGELADO en cada renglón al vender: los
 * anteriores a esa fecha no lo tienen y acá no se inventa, se avisa cuántos
 * quedaron afuera. La tabla agrupa por producto/marca/categoría/proveedor con
 * el MISMO dato — no son cuatro reportes, es uno con cuatro lentes.
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import TextField from "@mui/material/TextField";
import Alert from "@mui/material/Alert";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import Typography from "@mui/material/Typography";

import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import SavingsOutlinedIcon from "@mui/icons-material/SavingsOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import WarehouseOutlinedIcon from "@mui/icons-material/WarehouseOutlined";
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import BalanceOutlinedIcon from "@mui/icons-material/BalanceOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import StatCard from "../../components/Cards/StatCard/StatCard";
import DataTable from "../../components/DataTable/DataTable";
import { gerenciaApi, LENTES, agruparPorLente } from "./api/gerenciaApi";
import { money, num } from "../abastecimiento/api/comprasApi";

const hoyISO = () => new Date().toISOString().slice(0, 10);
const inicioMesISO = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

const margenCell = (v) => (v == null ? <span className="text-tertiary">—</span> : (
  <span className="mono" style={{ fontWeight: 600, color: v < 0 ? "var(--danger-text)" : "inherit" }}>{money(v)}</span>
));

const Rentabilidad = () => {
  const [params, setParams] = useSearchParams();
  const desde = params.get("desde") || inicioMesISO();
  const hasta = params.get("hasta") || hoyISO();
  const lente = params.get("lente") || "producto";
  const [soloSinFactura, setSoloSinFactura] = useState(false);

  const setParam = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next);
  };

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["gerencia", "rentabilidad", desde, hasta],
    queryFn: () => gerenciaApi.rentabilidad({ desde, hasta }),
  });

  const filas = useMemo(() => {
    const base = (data?.porProducto ?? []).filter((x) => !soloSinFactura || x.sinFactura);
    return agruparPorLente(base, lente);
  }, [data, lente, soloSinFactura]);

  const t = data?.totales;
  const f = data?.fiscal;
  const sf = data?.sinFactura;
  const stock = data?.stockSinFactura;
  const cob = data?.cobertura;
  const sinCosto = cob ? cob.renglones - cob.conCosto : 0;

  const columns = [
    { field: "nombre", headerName: LENTES[lente].label, renderCell: (r) => (
      <span>
        {r.nombre}
        {lente === "producto" && r.sinFactura && (
          <span className="text-tertiary" style={{ fontSize: "var(--text-xs)" }}> · sin factura{r.porcAhora ? ` (hoy ${num(r.porcAhora)}%)` : ""}</span>
        )}
      </span>
    ) },
    ...(lente !== "producto" ? [{ field: "productos", headerName: "Prod.", align: "right", renderCell: (r) => <span className="mono">{r.productos}</span> }] : []),
    { field: "unidades", headerName: "Unid.", align: "right", renderCell: (r) => <span className="mono">{num(r.unidades)}</span> },
    { field: "ventaNeta", headerName: "Venta neta", align: "right", renderCell: (r) => <span className="mono">{money(r.ventaNeta)}</span> },
    { field: "costo", headerName: "Costo real", align: "right", renderCell: (r) => <span className="mono text-tertiary">{r.costo != null ? money(r.costo) : "—"}</span> },
    { field: "margenReal", headerName: "Margen real", align: "right", renderCell: (r) => margenCell(r.margenReal) },
    { field: "margenRealPct", headerName: "%", align: "right", renderCell: (r) => <span className="mono text-tertiary">{r.margenRealPct != null ? `${num(r.margenRealPct)}%` : ""}</span> },
    { field: "ivaAbsorbido", headerName: "IVA absorbido", align: "right", renderCell: (r) => <span className="mono text-tertiary">{r.ivaAbsorbido > 0 ? money(r.ivaAbsorbido) : "—"}</span> },
  ];

  const columnsProveedor = [
    { field: "nombre", headerName: "Proveedor" },
    { field: "facturadoNeto", headerName: "Facturado (neto)", align: "right", renderCell: (r) => <span className="mono">{money(r.facturadoNeto)}</span> },
    { field: "liquidado", headerName: "Liquidación", align: "right", renderCell: (r) => <span className="mono">{money(r.liquidado)}</span> },
    { field: "porcReal", headerName: "% real", align: "right", renderCell: (r) => <span className="mono">{num(r.porcReal)}%</span> },
    { field: "porcDeclarado", headerName: "% declarado", align: "right", renderCell: (r) => <span className="mono">{num(r.porcDeclarado)}%</span> },
    { field: "desvio", headerName: "", renderCell: (r) => r.desvio && <span style={{ color: "var(--danger-text)", fontWeight: 700 }}>⚠ revisar el % de sus formatos</span> },
  ];

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Rentabilidad"
        subtitle="Margen real contra margen aparente: la diferencia es el IVA que el negocio absorbe por la mercadería sin factura. Todo sale del costo congelado en cada venta."
        actions={(
          <Box sx={{ display: "flex", gap: 1.5 }}>
            <TextField size="small" type="date" label="Desde" value={desde} onChange={(e) => setParam({ desde: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField size="small" type="date" label="Hasta" value={hasta} onChange={(e) => setParam({ hasta: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          </Box>
        )}
      />

      {isError && (
        <Alert severity="error">No se pudo cargar la rentabilidad: {error?.message || "error desconocido"}.</Alert>
      )}

      {data && (
        <>
          {sinCosto > 0 && (
            <Alert severity="info">
              <strong>{sinCosto}</strong> de {cob.renglones} renglones del período son anteriores al costo congelado y quedan <strong>fuera del margen</strong> (la venta sí se cuenta). A medida que se venda, este aviso desaparece solo.
            </Alert>
          )}

          <Grid container spacing={2.5}>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <StatCard title="Venta neta" value={money(t.ventaNeta)} icon={<PaymentsOutlinedIcon />} hint="Sin IVA ni cargos extra. Anuladas afuera." />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <StatCard title="Margen real" value={money(t.margenReal)} icon={<SavingsOutlinedIcon />} hint={t.ventaCosteada > 0 ? `${num((t.margenReal / t.ventaCosteada) * 100)}% sobre la venta costeada` : "Sin renglones con costo"} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <StatCard title="Margen aparente" value={money(t.margenAparente)} icon={<VisibilityOutlinedIcon />} hint="El que se ve si solo se mira el markup." />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <StatCard title="IVA absorbido" value={money(t.ivaAbsorbido)} icon={<BalanceOutlinedIcon />} hint="La diferencia entre los dos márgenes: sale del bolsillo al facturar." />
            </Grid>
          </Grid>

          <Grid container spacing={2.5}>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <StatCard title="Venta sin factura" value={money(sf.ventaNeta)} icon={<ReceiptLongOutlinedIcon />} hint={`${sf.productos} producto(s) · ${num(sf.participacion)}% de la venta del período`} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <StatCard title="Stock sin factura hoy" value={money(stock.valorReal)} icon={<WarehouseOutlinedIcon />} hint={`${stock.productos} producto(s) · si se vende todo, se absorben ${money(stock.ivaAbsorber)} más`} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <StatCard title="IVA débito (ventas facturadas)" value={money(f.debitoVentas)} icon={<Inventory2OutlinedIcon />} hint={`${f.ventasFacturadas} factura(s) de venta en el período`} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <StatCard title="Crédito vs. débito" value={money(f.posicion)} icon={<AccountBalanceOutlinedIcon />} hint={`Crédito: ${money(f.creditoCompras)} compras + ${money(f.creditoGastos)} gastos. ${f.posicion > 0 ? "El crédito NO alcanza: esto queda por pagar." : "El crédito cubre el débito del período."}`} />
            </Grid>
          </Grid>

          <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
            <ToggleButtonGroup size="small" exclusive value={lente} onChange={(_, v) => v && setParam({ lente: v === "producto" ? "" : v })}>
              {Object.entries(LENTES).map(([k, v]) => <ToggleButton key={k} value={k}>{v.label}</ToggleButton>)}
            </ToggleButtonGroup>
            <FormControlLabel
              sx={{ ml: "auto" }}
              control={<Checkbox size="small" checked={soloSinFactura} onChange={(e) => setSoloSinFactura(e.target.checked)} />}
              label="Solo mercadería sin factura"
            />
          </Box>

          <DataTable
            columns={columns}
            data={filas}
            emptyMessage={soloSinFactura ? "Nada vendido como sin factura en el período." : "Sin ventas en el período."}
          />
          {data.productosRecortados > 0 && (
            <Typography variant="body2" className="text-tertiary">
              La tabla muestra los 500 productos con más venta; quedaron {data.productosRecortados} afuera. Achicá el período para verlos.
            </Typography>
          )}

          {data.porProveedor.length > 0 && (
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>Compras sin factura por proveedor</Typography>
              <Typography variant="body2" className="text-tertiary" sx={{ mb: 1 }}>
                Lo que cada proveedor facturó de verdad en el período contra el % declarado en su ficha. Si difieren en serio, el costo de sus productos está mal partido — y el precio también.
              </Typography>
              <DataTable columns={columnsProveedor} data={data.porProveedor.map((p) => ({ ...p, id: p.proveedorId }))} emptyMessage="Sin compras con liquidación en el período." />
            </Box>
          )}
        </>
      )}

      {isLoading && !data && <Typography className="text-tertiary">Cargando el período…</Typography>}
    </Box>
  );
};

export default Rentabilidad;
