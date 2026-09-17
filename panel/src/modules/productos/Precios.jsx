/**
 * ⭐ Precios y márgenes — la pantalla que faltaba para la primera superficie que
 * se pidió controlar (MODULO-SEGURIDAD.md §4.1).
 *
 * Hasta acá, «cambiar el precio» no existía como operación: `catalogApi` era de
 * sólo lectura y el formulario del producto no persistía nada. Y la forma en que
 * se crea importa tanto como que exista:
 *
 * ⭐ **Un cambio de precio no es un campo de un formulario que se guarda.** Si
 * viviera dentro de un «Guardar producto» que pisa quince campos a la vez, el
 * asiento diría *"editó el producto"* y el motivo —si es que hubiera— valdría
 * para los quince. Es una operación con nombre propio, su motivo y su grado.
 *
 * Y el grado **cambia con el número que se escriba**: hasta el ±20 % alcanza con
 * el motivo; más allá, o si el precio deja el margen en negativo, hace falta que
 * lo firme otra persona.
 */
import { useState, useMemo } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import Tooltip from "@mui/material/Tooltip";

import SellOutlinedIcon from "@mui/icons-material/SellOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Permitido from "../seguridad/components/Permitido";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useToast } from "../../components/Toast/ToastContext";

import ReasonDialog from "../seguridad/components/ReasonDialog";
import StepUpDialog from "../seguridad/components/StepUpDialog";
import { THRESHOLDS } from "../seguridad/api/securityApi";
import { listPricing, describePriceChange, setPrice, listPriceHistory } from "./api/catalogApi";
import "./Productos.css";

const money = (v) => (v == null ? "—" : `$${Math.round(v).toLocaleString("es-AR")}`);
const pct = (v) => (v == null ? "—" : `${(v * 100).toFixed(1)} %`);

const Precios = () => {
  const { showToast } = useToast();
  const [tick, setTick] = useState(0);
  const [search, setSearch] = useState("");

  const [target, setTarget] = useState(null);   // { product, nextPrice }
  const [draft, setDraft] = useState({});       // precio tipeado por fila
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [error, setError] = useState(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => listPricing({ search }), [search, tick]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const history = useMemo(() => listPriceHistory({ limit: 12 }), [tick]);

  // ⭐ El plan se recalcula en vivo: la pantalla dice **antes de tocar nada** si
  // esto va a aplicarse o a quedar esperando una firma.
  const plan = target ? describePriceChange(target.product.id, target.nextPrice) : null;

  const open = (product) => {
    const next = Number(draft[product.id]);
    const check = describePriceChange(product.id, next);
    if (!check.ok) { showToast(check.error, "warning"); return; }
    setError(null);
    setTarget({ product, nextPrice: next });
  };

  const confirm = (reason) => {
    try {
      setPrice(target.product.id, { price: target.nextPrice, reason });
      showToast(`Precio actualizado: ${target.product.name}`, "success");
      setDraft((d) => ({ ...d, [target.product.id]: "" }));
      setTarget(null);
      setTick((t) => t + 1);
    } catch (err) {
      setTick((t) => t + 1);
      if (err.queued) {
        setTarget(null);
        showToast(err.message, "info");
        return;
      }
      if (err.needsStepUp) { setStepUpOpen(true); return; }
      setError(err.message);
    }
  };

  const columns = [
    {
      field: "name",
      headerName: "Producto",
      renderCell: (row) => (
        <Box>
          <strong>{row.name}</strong>
          <div className="text-tertiary mono" style={{ fontSize: 11 }}>{row.sku}</div>
        </Box>
      ),
    },
    { field: "cost", headerName: "Costo", align: "right", renderCell: (row) => money(row.cost) },
    {
      field: "price",
      headerName: "Precio vigente",
      align: "right",
      renderCell: (row) => <strong>{money(row.price)}</strong>,
    },
    {
      field: "margin",
      headerName: "Margen",
      align: "right",
      renderCell: (row) => (
        <StatusBadge
          tone={row.margin < 0 ? "danger" : (row.margin < 0.2 ? "warning" : "success")}
          label={pct(row.margin)}
          showDot={false}
        />
      ),
    },
    {
      field: "lastChange",
      headerName: "Último cambio",
      renderCell: (row) => (row.lastChange
        ? (
          <Tooltip title={row.lastChange.reason}>
            <span className="text-secondary">{money(row.lastChange.before)} → {money(row.lastChange.after)}</span>
          </Tooltip>
        )
        : <span className="text-tertiary">sin cambios registrados</span>),
    },
    {
      field: "nuevo",
      headerName: "Precio nuevo",
      align: "right",
      renderCell: (row) => (
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", justifyContent: "flex-end" }}>
          <TextField
            size="small"
            type="number"
            placeholder={String(row.price)}
            value={draft[row.id] ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, [row.id]: e.target.value }))}
            onClick={(e) => e.stopPropagation()}
            sx={{ width: 120 }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start">$</InputAdornment> } }}
          />
          <Permitido permiso="productos.precio">
            <Button
              variant="ghost"
              size="small"
              disabled={!draft[row.id]}
              onClick={(e) => { e.stopPropagation(); open(row); }}
            >
              Cambiar
            </Button>
          </Permitido>
        </Box>
      ),
    },
  ];

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Precios y márgenes"
        subtitle="Cambiar un precio es una operación con nombre, motivo y grado — no un campo que se guarda junto con otros catorce."
        actions={(
          <TextField
            size="small"
            placeholder="Buscar producto o SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
      />

      <Card className="entity-card sec-note">
        <SellOutlinedIcon fontSize="small" />
        <span>
          <strong>El umbral decide el grado.</strong>
          Hasta <strong>{THRESHOLDS.precio.label}</strong> alcanza con el motivo escrito. Por encima —o si el
          precio nuevo deja el margen en negativo— la operación no se aplica: queda esperando la firma de otra
          persona. Ojo: un <strong>descuento de Marketing no es un cambio de precio</strong>; ahí el precio de
          lista no se toca y se audita por otro camino.
        </span>
      </Card>

      <DataTable columns={columns} data={rows} emptyMessage="No hay productos que coincidan." />

      {history.length > 0 && (
        <Card className="entity-card">
          <Typography variant="h6" className="card-title">Cambios de precio de esta sesión</Typography>
          <Box className="sec-trail">
            {history.map((h) => (
              <div className="sec-trail__row" key={h.id}>
                <div className="sec-trail__head">
                  <strong>{h.name}</strong>
                  <span className="sec-chip">{money(h.before)} → {money(h.after)}</span>
                  <span className={`sec-chip ${Math.abs(h.variation) > THRESHOLDS.precio.pct ? "sec-chip--warning" : ""}`}>
                    {h.variation > 0 ? "+" : ""}{(h.variation * 100).toFixed(1)} %
                  </span>
                  <Box sx={{ flex: 1 }} />
                  <em className="text-tertiary">margen {pct(h.margin)}</em>
                </div>
                <div className="sec-trail__reason">Motivo: “{h.reason}”</div>
              </div>
            ))}
          </Box>
        </Card>
      )}

      <ReasonDialog
        open={Boolean(target)}
        action={plan?.permission || "productos.precio"}
        title={target ? `Cambiar el precio de ${target.product.name}` : ""}
        preview={plan?.ok ? `${money(plan.product.price)} → ${money(plan.price)}` : null}
        confirmLabel="Cambiar el precio"
        error={error}
        onClose={() => { setTarget(null); setError(null); }}
        onConfirm={confirm}
        extra={plan?.ok && (
          <Box className="sec-kv">
            <span>Variación</span>
            <div>{plan.variation > 0 ? "+" : ""}{(plan.variation * 100).toFixed(1)} %</div>
            <span>Margen</span>
            <div>{pct(plan.marginBefore)} → <strong>{pct(plan.margin)}</strong></div>
            {plan.why && <><span>Por qué sube de grado</span><div>{plan.why}</div></>}
          </Box>
        )}
      />

      <StepUpDialog
        open={stepUpOpen}
        action="Cambiar un precio fuera de umbral"
        onClose={() => setStepUpOpen(false)}
        onDone={() => setStepUpOpen(false)}
      />
    </Box>
  );
};

export default Precios;
