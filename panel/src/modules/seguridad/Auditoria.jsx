/**
 * Auditoría (§7) — la lente por **entidad y acción**.
 *
 * Contesta *"¿quién tocó esto, cuándo y qué cambió?"*. La otra lente, la del
 * actor, vive en Actividad: es el mismo asiento mirado desde el otro lado.
 *
 * ⭐ Ver la auditoría **es ver datos sensibles** —importes, clientes, motivos—,
 * así que la lectura es un permiso propio y se aplica en el `api/`.
 */
import { useState, useMemo, useEffect } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";

import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";

import { ActorChip } from "./components/ChangeLog";
import {
  getAuditLog, getAuditSummary, exportAuditCsv, auditActors, PERMISSION_MODULES,
  getPermission, describeChange, getGrade,
} from "./api/securityApi";
import "./Seguridad.css";

/** El BOM hace que Excel abra el CSV en UTF-8 y no rompa los acentos. */
const download = (csv, filename) => {
  const blob = new Blob([String.fromCharCode(0xFEFF) + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const stamp = (iso) => new Date(iso).toLocaleString("es-AR", {
  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit",
});

const Auditoria = () => {
  const { showToast } = useToast();
  const { user } = useAuth();

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, []);

  const [module, setModule] = useState("");
  const [actorId, setActorId] = useState("");
  const [result, setResult] = useState("");
  const [onlyChanges, setOnlyChanges] = useState(false);
  const [search, setSearch] = useState("");

  const filters = useMemo(
    () => ({ module, actorId, result, onlyChanges, search }),
    [module, actorId, result, onlyChanges, search]
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const log = useMemo(() => getAuditLog(filters, { role: user }), [filters, user, tick]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const summary = useMemo(() => getAuditSummary(), [tick]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const actors = useMemo(() => auditActors(), [tick]);

  const handleExport = () => {
    const res = exportAuditCsv(filters);
    if (!res.ok) { showToast(res.error, "warning"); return; }
    download(res.csv, `auditoria-${new Date().toISOString().slice(0, 10)}.csv`);
    showToast(`${res.rows} asiento(s) exportados — y la exportación quedó registrada.`, "success");
  };

  if (!log.ok) {
    return (
      <Box className="page fade-in">
        <PageHeader title="Auditoría" subtitle="Quién hizo qué, cuándo y qué cambió." />
        <Card className="entity-card sec-note">
          <StatusBadge tone="warning" label="Sin permiso" showDot={false} />
          <span>
            {log.error} Ver el rastro es, en sí mismo, ver datos sensibles: importes, clientes y
            motivos. Por eso es un permiso propio y se aplica en el <code className="sec-code">api/</code>,
            no escondiendo la pantalla.
          </span>
        </Card>
      </Box>
    );
  }

  const columns = [
    {
      field: "at", headerName: "Cuándo",
      renderCell: (e) => <span className="nowrap text-tertiary">{stamp(e.at)}</span>,
    },
    {
      field: "actor", headerName: "Quién",
      renderCell: (e) => <ActorChip actor={e.actor} />,
    },
    {
      field: "action", headerName: "Qué hizo",
      renderCell: (e) => {
        const permission = getPermission(e.action);
        const grade = getGrade(permission?.grade);
        return (
          <Box className="sec-cell">
            <Tooltip title={permission?.hint || ""}>
              <strong>{permission?.label || e.action}</strong>
            </Tooltip>
            <em>{e.action} · {grade.label.toLowerCase()}</em>
          </Box>
        );
      },
    },
    {
      field: "subject", headerName: "Sobre",
      renderCell: (e) => (e.subject
        ? (
          <Box className="sec-cell">
            <strong>{e.subject.label || e.subject.id}</strong>
            <em>{e.subject.type} {e.subject.id}</em>
          </Box>
        )
        : <span className="text-tertiary">—</span>),
    },
    {
      field: "changes", headerName: "Qué cambió",
      renderCell: (e) => (e.changes.length === 0
        ? <span className="text-tertiary">{e.readOnly ? "sólo lectura" : "—"}</span>
        : (
          <Box className="sec-cell">
            {e.changes.slice(0, 2).map((c) => <em key={c.field}>{describeChange(c)}</em>)}
            {e.changes.length > 2 && <em>y {e.changes.length - 2} más</em>}
          </Box>
        )),
    },
    {
      field: "reason", headerName: "Motivo",
      renderCell: (e) => (e.reason
        ? <span className="text-secondary">{e.reason}</span>
        : <span className="text-tertiary">—</span>),
    },
    {
      field: "result", headerName: "Resultado", align: "center",
      renderCell: (e) => (e.result === "ok"
        ? <StatusBadge tone="success" label="OK" showDot={false} />
        : <Tooltip title={e.denial || ""}><span><StatusBadge tone="danger" label="Rechazado" showDot={false} /></span></Tooltip>),
    },
  ];

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Auditoría"
        subtitle="Un asiento por hecho consumado: quién, sobre qué, qué campos cambiaron y por qué."
        actions={(
          <Button variant="primary" startIcon={<DownloadOutlinedIcon />} onClick={handleExport}>
            Exportar CSV
          </Button>
        )}
      />

      <Box className="sec-summary">
        <div className="sec-summary__item"><strong>{summary.total}</strong><span>asientos</span></div>
        <div className="sec-summary__item"><strong>{summary.changes}</strong><span>con cambios</span></div>
        <div className="sec-summary__item"><strong>{summary.reads}</strong><span>sólo actividad</span></div>
        <div className="sec-summary__item"><strong>{summary.withReason}</strong><span>con motivo</span></div>
        <div className="sec-summary__item"><strong>{summary.rejected}</strong><span>rechazados</span></div>
        <div className="sec-summary__item">
          <strong>{Object.keys(summary.byKind).length}</strong><span>tipos de actor</span>
        </div>
      </Box>

      {/* ------------------------------------------------ la retención */}
      <Card className="entity-card sec-note">
        <HistoryOutlinedIcon />
        <div>
          <strong>
            {summary.dropped === 0
              ? `La traza guarda hasta ${summary.limit} asientos y todavía no se cayó ninguno.`
              : `⚠ ${summary.dropped} asiento(s) ya no están en memoria.`}
          </strong>
          <span>
            La retención es acotada porque todo vive en el navegador. El problema de la traza del bus
            no es el tope: <strong>es el silencio</strong>. Acá lo que se cae se cuenta y se dice, y
            se puede exportar antes. Una auditoría a prueba de manipulación necesita backend (§10).
          </span>
        </div>
      </Card>

      {/* --------------------------------------------------- filtros */}
      <Box className="table-tabs">
        <TextField select size="small" label="Módulo" value={module} onChange={(e) => setModule(e.target.value)} sx={{ minWidth: 200 }}>
          <MenuItem value="">Todos</MenuItem>
          {PERMISSION_MODULES.map((m) => <MenuItem key={m.key} value={m.key}>{m.label}</MenuItem>)}
        </TextField>

        <TextField select size="small" label="Actor" value={actorId} onChange={(e) => setActorId(e.target.value)} sx={{ minWidth: 220 }}>
          <MenuItem value="">Todos</MenuItem>
          {actors.map((a) => (
            <MenuItem key={`${a.kind}:${a.id}`} value={a.id}>{a.name} ({a.entries})</MenuItem>
          ))}
        </TextField>

        <TextField select size="small" label="Resultado" value={result} onChange={(e) => setResult(e.target.value)} sx={{ minWidth: 160 }}>
          <MenuItem value="">Todos</MenuItem>
          <MenuItem value="ok">OK</MenuItem>
          <MenuItem value="rechazado">Rechazados</MenuItem>
        </TextField>

        <Button variant={onlyChanges ? "primary" : "secondary"} onClick={() => setOnlyChanges((v) => !v)}>
          Sólo cambios
        </Button>

        <Box sx={{ flex: 1 }} />
        <TextField
          size="small" placeholder="Buscar por acción, sujeto o motivo…"
          value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 280 }}
        />
      </Box>

      <DataTable
        columns={columns}
        data={log.entries}
        emptyMessage="Todavía no hay asientos que coincidan. La auditoría se llena operando: no se inventan registros hacia atrás."
      />

      <Typography variant="caption" className="text-tertiary">
        La auditoría <strong>no se puede editar ni borrar desde el panel</strong>, ni por un
        administrador: una auditoría borrable no prueba nada, y el permiso de borrarla sería el único
        que habría que auditar de verdad.
      </Typography>
    </Box>
  );
};

export default Auditoria;
