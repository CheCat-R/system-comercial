import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";

import { useToast } from "../../../components/Toast/ToastContext";
import { getCommissionRates, updateCommissionRate } from "../api/financeApi";
import "./CommissionRateTable.css";

/** Editor de tarifas de comisión: pasarela (fee por medio de pago) y vendedores (% sobre venta). */
const CommissionRateTable = ({ onChange }) => {
  const { showToast } = useToast();
  const rates = getCommissionRates();
  const pasarela = rates.filter((r) => r.kind === "pasarela");
  const vendedor = rates.filter((r) => r.kind === "vendedor");

  const commit = (id, raw) => {
    const pct = Number(raw) / 100;
    if (Number.isNaN(pct) || pct < 0 || pct > 1) return;
    updateCommissionRate(id, { percent: pct });
    showToast("Tarifa actualizada", "success");
    onChange?.();
  };

  const Row = ({ r, sub }) => (
    <Box className="crt-row">
      <Box>
        <div>{r.label}</div>
        {sub && <div className="crt-row__sub">{sub}</div>}
      </Box>
      <TextField
        size="small" type="number"
        defaultValue={(r.percent * 100).toString()}
        onBlur={(e) => commit(r.id, e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        slotProps={{ input: { endAdornment: <span className="crt-pct">%</span> } }}
        sx={{ width: 110 }}
      />
    </Box>
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <Box>
        <Typography variant="h6" className="card-title">Pasarela y medios de pago</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Fee que descuenta la pasarela en cada cobro. Impacta la rentabilidad de cada pedido.
        </Typography>
        <Box className="crt-list">
          {pasarela.map((r) => <Row key={r.id} r={r} sub={r.key === "__default__" ? "Se aplica si el medio de pago no matchea ninguno de los anteriores" : null} />)}
        </Box>
      </Box>

      <Box>
        <Typography variant="h6" className="card-title">Vendedores (B2B)</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Comisión sobre la venta neta de los pedidos mayoristas. Se devenga con la venta y se liquida
          en un pago aparte.
        </Typography>
        <Box className="crt-list">
          {vendedor.map((r) => <Row key={r.id} r={r} sub="Sobre venta neta" />)}
        </Box>
      </Box>
    </Box>
  );
};

export default CommissionRateTable;
