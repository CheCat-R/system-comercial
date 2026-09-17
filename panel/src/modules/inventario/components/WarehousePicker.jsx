import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import { listBranches, listWarehouses } from "../api/inventoryApi";

/**
 * Selector en cascada Sucursal → Depósito. `value = { branchId, warehouseId }` (null = "todas/todos").
 */
const WarehousePicker = ({ value, onChange }) => {
  const branches = listBranches();
  const warehouses = listWarehouses(value.branchId || undefined);

  return (
    <>
      <Select
        size="small"
        displayEmpty
        value={value.branchId || ""}
        onChange={(e) => onChange({ branchId: e.target.value || null, warehouseId: null })}
      >
        <MenuItem value="">Todas las sucursales</MenuItem>
        {branches.map((b) => (
          <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>
        ))}
      </Select>
      <Select
        size="small"
        displayEmpty
        value={value.warehouseId || ""}
        onChange={(e) => onChange({ ...value, warehouseId: e.target.value || null })}
      >
        <MenuItem value="">Todos los depósitos</MenuItem>
        {warehouses.map((w) => (
          <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>
        ))}
      </Select>
    </>
  );
};

export default WarehousePicker;
