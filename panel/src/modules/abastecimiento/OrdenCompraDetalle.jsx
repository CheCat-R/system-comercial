import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";

import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";

import Button from "../../components/Button/Button";
import EntityHeader from "../../components/EntityHeader/EntityHeader";
import Permitido from "../seguridad/components/Permitido";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import {
  getPurchaseOrder, createPurchaseOrder, updatePurchaseOrderLines, sendPurchaseOrder,
  cancelPurchaseOrder, closePurchaseOrder, receivePurchaseOrder,
  listSuppliers, listWarehouses, getSupplierCatalog, getSupplier,
} from "./api/supplyApi";
import { PO_STATUS, PO_STEPS } from "./lib/purchaseOrders";
import { money, formatDate, formatDateTime } from "./lib/time";
import "./OrdenCompraDetalle.css";

const emptyLine = () => ({ skuId: "", qtyOrdered: "", unitCost: "" });

const OrdenCompraDetalle = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const isNew = id === "nueva";

  // Todos los hooks se declaran sin condicionar — el componente tiene dos modos (creación /
  // detalle) resueltos con returns tempranos MÁS ABAJO, nunca antes de terminar de llamar hooks.
  const [, setTick] = useState(0);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receivedQty, setReceivedQty] = useState({});
  const [editLines, setEditLines] = useState(null);

  // ---- Modo creación (puede llegar pre-cargado desde el perfil de un Proveedor o desde
  // Reposición, que además de `supplierId` manda `warehouseId` y `lines` ya armadas) ---------
  const [supplierId, setSupplierId] = useState(location.state?.supplierId || "");
  const [warehouseId, setWarehouseId] = useState(location.state?.warehouseId || "");
  const [expectedDate, setExpectedDate] = useState("");
  const [newLines, setNewLines] = useState(location.state?.lines?.length ? location.state.lines : [emptyLine()]);

  if (isNew) {
    const catalog = supplierId ? getSupplierCatalog(supplierId) : [];

    const updateLine = (i, patch) => setNewLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
    const pickSku = (i, skuId) => {
      const entry = catalog.find((c) => c.skuId === skuId);
      updateLine(i, { skuId, unitCost: entry ? entry.cost : "" });
    };
    const addLine = () => setNewLines((ls) => [...ls, emptyLine()]);
    const removeLine = (i) => setNewLines((ls) => ls.filter((_, idx) => idx !== i));

    const handleCreate = () => {
      try {
        const order = createPurchaseOrder({ supplierId, warehouseId, expectedDate: expectedDate || null, lines: newLines, createdBy: "Vos" });
        showToast("Orden de Compra creada en borrador", "success");
        navigate(`/abastecimiento/ordenes-compra/${order.id}`);
      } catch (err) {
        showToast(err.message, "warning");
      }
    };

    return (
      <Box className="page fade-in">
        <EntityHeader
          title="Nueva Orden de Compra"
          onBack={() => navigate("/abastecimiento/ordenes-compra")}
          backLabel="Volver a órdenes de compra"
          actions={<Button variant="primary" onClick={handleCreate}>Guardar como borrador</Button>}
        />

        <Card className="entity-card">
          <Typography variant="h6" className="card-title">Datos generales</Typography>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            <Select size="small" displayEmpty value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setNewLines([emptyLine()]); }} sx={{ minWidth: 240 }}>
              <MenuItem value="" disabled>Proveedor…</MenuItem>
              {listSuppliers().map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
            </Select>
            <Select size="small" displayEmpty value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} sx={{ minWidth: 220 }}>
              <MenuItem value="" disabled>Depósito destino…</MenuItem>
              {listWarehouses().map((w) => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
            </Select>
            <TextField
              size="small" type="date" label="Fecha esperada"
              slotProps={{ inputLabel: { shrink: true } }}
              value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)}
            />
          </Box>
        </Card>

        <Card className="entity-card mt-3">
          <Typography variant="h6" className="card-title">Líneas</Typography>
          {!supplierId && <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Elegí un proveedor para ver su catálogo.</Typography>}
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            {newLines.map((line, i) => (
              <Box key={i} className="aba-line-row">
                <Select size="small" displayEmpty value={line.skuId} onChange={(e) => pickSku(i, e.target.value)} disabled={!supplierId} sx={{ flex: 2 }}>
                  <MenuItem value="" disabled>SKU…</MenuItem>
                  {catalog.map((c) => <MenuItem key={c.skuId} value={c.skuId}>{c.name}</MenuItem>)}
                </Select>
                <TextField size="small" type="number" placeholder="Cantidad" value={line.qtyOrdered} onChange={(e) => updateLine(i, { qtyOrdered: e.target.value })} sx={{ flex: 1 }} />
                <TextField size="small" type="number" placeholder="Costo unitario" value={line.unitCost} onChange={(e) => updateLine(i, { unitCost: e.target.value })} sx={{ flex: 1 }} />
                <IconButton size="small" onClick={() => removeLine(i)} disabled={newLines.length === 1} aria-label="quitar línea">
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
            <Button variant="ghost" size="small" startIcon={<AddIcon />} onClick={addLine} disabled={!supplierId} sx={{ alignSelf: "flex-start" }}>
              Agregar línea
            </Button>
          </Box>
        </Card>
      </Box>
    );
  }

  // ---- Modo detalle ---------------------------------------------------------
  const order = getPurchaseOrder(id);

  if (!order) {
    return (
      <Box className="page fade-in">
        <Typography>No se encontró la Orden de Compra {id}.</Typography>
        <Button variant="ghost" onClick={() => navigate("/abastecimiento/ordenes-compra")}>Volver</Button>
      </Box>
    );
  }

  const isCancelled = order.status === "cancelada";
  const stepIndex = PO_STEPS.indexOf(order.status === "parcial" ? "enviada" : order.status);

  const openReceive = () => {
    const defaults = {};
    order.lines.filter((l) => l.pending > 0).forEach((l) => { defaults[l.skuId] = l.pending; });
    setReceivedQty(defaults);
    setReceiveOpen(true);
  };

  const startEditingLines = () => setEditLines(order.lines.map((l) => ({ skuId: l.skuId, qtyOrdered: l.qtyOrdered, unitCost: l.unitCost })));
  const updateEditLine = (i, patch) => setEditLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addEditLine = () => setEditLines((ls) => [...ls, emptyLine()]);
  const removeEditLine = (i) => setEditLines((ls) => ls.filter((_, idx) => idx !== i));
  const saveEditLines = () => {
    updatePurchaseOrderLines(order.id, editLines);
    setEditLines(null);
    setTick((t) => t + 1);
    showToast("Líneas actualizadas", "success");
  };

  const handleSend = () => {
    try {
      sendPurchaseOrder(order.id);
      setTick((t) => t + 1);
      showToast("Orden enviada al proveedor", "success");
    } catch (err) {
      showToast(err.message, "warning");
    }
  };

  const handleCancel = () => {
    cancelPurchaseOrder(order.id);
    setTick((t) => t + 1);
    showToast("Orden de Compra cancelada", "info");
  };

  const handleClose = () => {
    closePurchaseOrder(order.id);
    setTick((t) => t + 1);
    showToast("Orden de Compra cerrada", "success");
  };

  const handleReceive = () => {
    try {
      const lines = Object.entries(receivedQty).map(([skuId, qtyReceived]) => ({ skuId, qtyReceived: Number(qtyReceived) }));
      receivePurchaseOrder(order.id, { lines, receivedBy: "Vos" });
      setReceiveOpen(false);
      setTick((t) => t + 1);
      showToast("Recepción registrada — el stock ya está actualizado en Inventario", "success");
    } catch (err) {
      showToast(err.message, "warning");
    }
  };

  const supplier = getSupplier(order.supplierId);

  return (
    <Box className="page fade-in">
      <EntityHeader
        title={`Orden de Compra ${order.id}`}
        subtitle={`${order.supplierName} → ${order.warehouseName} · esperada ${formatDate(order.expectedDate)}`}
        badges={isCancelled
          ? <span className={`tier-badge tier-badge--${PO_STATUS.cancelada.tone}`}>Cancelada</span>
          : null}
        below={!isCancelled && (
          <Box className="aba-pipeline">
            {PO_STEPS.map((step, i) => (
              <span key={step} className={`aba-pipeline__step ${i < stepIndex ? "aba-pipeline__step--done" : i === stepIndex ? "aba-pipeline__step--current" : ""}`}>
                {order.status === "parcial" && step === "enviada" ? "Parcial" : PO_STATUS[step].label}
              </span>
            ))}
          </Box>
        )}
        onBack={() => navigate("/abastecimiento/ordenes-compra")}
        backLabel="Volver a órdenes de compra"
        actions={(
          <>
            {order.status === "borrador" && (
              <>
                <Permitido permiso="abastecimiento.cancelar_oc">
                  <Button variant="danger" onClick={handleCancel}>Cancelar</Button>
                </Permitido>
                <Permitido permiso="abastecimiento.enviar_oc">
                  <Button variant="primary" onClick={handleSend}>Enviar</Button>
                </Permitido>
              </>
            )}
            {["enviada", "parcial"].includes(order.status) && (
              <Button variant="primary" onClick={openReceive}>Registrar recepción</Button>
            )}
            {order.status === "recibida" && (
              <Button variant="primary" onClick={handleClose}>Cerrar OC</Button>
            )}
          </>
        )}
      />

      <Card className="entity-card">
        <Box className="card-title-row">
          <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>Líneas</Typography>
          {order.status === "borrador" && !editLines && (
            <Button variant="ghost" size="small" onClick={startEditingLines}>Editar líneas</Button>
          )}
        </Box>

        {editLines ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            {editLines.map((line, i) => (
              <Box key={i} className="aba-line-row">
                <TextField size="small" value={line.skuId} disabled sx={{ flex: 2 }} />
                <TextField size="small" type="number" placeholder="Cantidad" value={line.qtyOrdered} onChange={(e) => updateEditLine(i, { qtyOrdered: e.target.value })} sx={{ flex: 1 }} />
                <TextField size="small" type="number" placeholder="Costo unitario" value={line.unitCost} onChange={(e) => updateEditLine(i, { unitCost: e.target.value })} sx={{ flex: 1 }} />
                <IconButton size="small" onClick={() => removeEditLine(i)} disabled={editLines.length === 1} aria-label="quitar línea">
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
            <Box sx={{ display: "flex", gap: 1, justifyContent: "space-between" }}>
              <Button variant="ghost" size="small" startIcon={<AddIcon />} onClick={addEditLine}>Agregar línea</Button>
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button variant="ghost" size="small" onClick={() => setEditLines(null)}>Cancelar</Button>
                <Button variant="primary" size="small" onClick={saveEditLines}>Guardar líneas</Button>
              </Box>
            </Box>
          </Box>
        ) : (
          <table className="line-table aba-lines-table">
            <thead>
              <tr><th>SKU</th><th>Pedida</th><th>Costo unit.</th><th>Recibida</th><th>Pendiente</th><th>Subtotal</th></tr>
            </thead>
            <tbody>
              {order.lines.map((l) => (
                <tr key={l.skuId}>
                  <td>{l.name} <span className="mono text-tertiary">({l.sku})</span></td>
                  <td>{l.qtyOrdered}</td>
                  <td>{money(l.unitCost)}</td>
                  <td>{l.qtyReceived}</td>
                  <td>{l.pending}</td>
                  <td>{money(l.subtotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={5}>Total</td><td>{money(order.total)}</td></tr>
            </tfoot>
          </table>
        )}
      </Card>

      {order.receipts.length > 0 && (
        <Card className="entity-card mt-3">
          <Typography variant="h6" className="card-title">Recepciones</Typography>
          {order.receipts.map((r) => (
            <Box key={r.id} className="aba-receipt-item">
              <span>{r.id} · {r.units} unidades · {r.receivedBy}</span>
              <span className="text-tertiary">{formatDateTime(r.at)}</span>
            </Box>
          ))}
        </Card>
      )}

      <Card className="entity-card mt-3">
        <Typography variant="h6" className="card-title">Historial</Typography>
        <Typography variant="body2" color="text.secondary">Creada {formatDateTime(order.createdAt)} por {order.createdBy}.</Typography>
        {order.sentAt && <Typography variant="body2" color="text.secondary">Enviada {formatDateTime(order.sentAt)}.</Typography>}
        {order.closedAt && <Typography variant="body2" color="text.secondary">Cerrada {formatDateTime(order.closedAt)}.</Typography>}
        {supplier && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Condiciones: {supplier.paymentTerms}.</Typography>}
      </Card>

      <Modal
        open={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        title="Registrar recepción"
        subtitle="Confirmá la cantidad recibida por línea — puede ser parcial."
        actions={<><Button variant="ghost" onClick={() => setReceiveOpen(false)}>Cancelar</Button><Button variant="primary" onClick={handleReceive}>Confirmar recepción</Button></>}
      >
        <table className="line-table aba-lines-table">
          <thead><tr><th>SKU</th><th>Pendiente</th><th>Recibido ahora</th></tr></thead>
          <tbody>
            {order.lines.filter((l) => l.pending > 0).map((l) => (
              <tr key={l.skuId}>
                <td>{l.name}</td>
                <td>{l.pending}</td>
                <td>
                  <input
                    type="number"
                    max={l.pending}
                    value={receivedQty[l.skuId] ?? l.pending}
                    onChange={(e) => setReceivedQty((q) => ({ ...q, [l.skuId]: e.target.value }))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Modal>
    </Box>
  );
};

export default OrdenCompraDetalle;
