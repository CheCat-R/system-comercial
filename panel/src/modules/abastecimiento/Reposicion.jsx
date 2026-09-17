import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import Checkbox from "@mui/material/Checkbox";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";

import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import StatCard from "../../components/Cards/StatCard/StatCard";
import { useToast } from "../../components/Toast/ToastContext";
import { getReplenishmentSuggestions, getReplenishmentSummary, listWarehouses } from "./api/supplyApi";
import { money } from "./lib/time";
import "./Reposicion.css";

const Reposicion = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [warehouseId, setWarehouseId] = useState("");
  const [selected, setSelected] = useState({}); // { [groupKey]: Set(skuId) }

  const summary = getReplenishmentSummary();
  const groups = getReplenishmentSuggestions({ warehouseId: warehouseId || undefined });

  const isChecked = (groupKey, skuId) => (selected[groupKey] ? selected[groupKey].has(skuId) : true);

  const toggleItem = (groupKey, skuId, allSkuIds) => {
    setSelected((prev) => {
      const current = new Set(prev[groupKey] || allSkuIds);
      if (current.has(skuId)) current.delete(skuId); else current.add(skuId);
      return { ...prev, [groupKey]: current };
    });
  };

  const kpis = [
    { title: "SKUs bajo mínimo", value: String(summary.belowMin), icon: <WarningAmberOutlinedIcon /> },
    { title: "SKUs críticos", value: String(summary.critical), icon: <ErrorOutlineOutlinedIcon /> },
    { title: "Monto estimado a reponer", value: money(summary.estimatedTotal), icon: <AccountBalanceWalletOutlinedIcon /> },
  ];

  const createOrderFromGroup = (group) => {
    const checkedItems = group.items.filter((i) => isChecked(group.key, i.skuId));
    if (checkedItems.length === 0) return showToast("Seleccioná al menos un SKU", "warning");
    navigate("/abastecimiento/ordenes-compra/nueva", {
      state: {
        supplierId: group.supplierId,
        warehouseId: group.warehouseId,
        lines: checkedItems.map((i) => ({ skuId: i.skuId, qtyOrdered: i.suggestedQty, unitCost: i.unitCost || "" })),
      },
    });
  };

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Reposición"
        subtitle="Sugerencias calculadas contra stock mínimo y de seguridad, agrupadas por proveedor preferido."
      />

      <Grid container spacing={2.5}>
        {kpis.map((k) => (
          <Grid key={k.title} size={{ xs: 12, sm: 6, lg: 4 }}>
            <StatCard {...k} />
          </Grid>
        ))}
      </Grid>

      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Select size="small" displayEmpty value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
          <MenuItem value="">Todos los depósitos</MenuItem>
          {listWarehouses().map((w) => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
        </Select>
      </Box>

      {groups.length === 0 && (
        <Card className="entity-card">
          <Typography variant="body2" color="text.secondary">
            No hay SKUs bajo mínimo en este momento — nada para reponer.
          </Typography>
        </Card>
      )}

      {groups.map((group) => (
        <Card key={group.key} className="entity-card rep-group">
          <Box className="rep-group__header">
            <Box className="rep-group__title">
              <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>
                {group.supplierId ? group.supplierName : <span className="rep-group__unassigned">{group.supplierName}</span>}
              </Typography>
              <Typography variant="body2" color="text.secondary">· {group.warehouseName}</Typography>
            </Box>
            {group.supplierId ? (
              <Button variant="primary" size="small" onClick={() => createOrderFromGroup(group)}>
                Crear Orden de Compra ({money(group.totalEstimated)})
              </Button>
            ) : (
              <Typography variant="caption" color="text.secondary">
                Asigná un proveedor preferido en el catálogo del SKU para poder generar la OC.
              </Typography>
            )}
          </Box>

          <Box sx={{ overflowX: "auto" }}>
            <table className="line-table rep-table">
              <thead>
                <tr>
                  <th></th><th>Producto</th><th>On hand</th><th>Mínimo</th><th>Seguridad</th>
                  <th>Sugerido</th><th>Costo unit.</th><th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((item) => (
                  <tr key={item.skuId}>
                    <td>
                      <Checkbox
                        size="small"
                        checked={isChecked(group.key, item.skuId)}
                        onChange={() => toggleItem(group.key, item.skuId, group.items.map((i) => i.skuId))}
                        disabled={!group.supplierId}
                      />
                    </td>
                    <td>{item.name} <span className="mono text-tertiary">({item.sku})</span></td>
                    <td>{item.onHand}</td>
                    <td>{item.minStock}</td>
                    <td>{item.safetyStock}</td>
                    <td>{item.suggestedQty}</td>
                    <td>{item.unitCost != null ? money(item.unitCost) : "—"}</td>
                    <td>{item.estimatedCost != null ? money(item.estimatedCost) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        </Card>
      ))}
    </Box>
  );
};

export default Reposicion;
