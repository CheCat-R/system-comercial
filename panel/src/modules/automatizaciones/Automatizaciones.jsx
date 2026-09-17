/**
 * La lista de automatizaciones (§9.1).
 *
 * Lo que importa está a la vista: **cuándo se disparó por última vez y cómo le
 * fue**. Una automatización sin esa columna es un acto de fe.
 *
 * En F1 la regla se lee y se pausa, no se edita: el Builder llega en F2.
 */
import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import Tooltip from "@mui/material/Tooltip";

import MoreVertIcon from "@mui/icons-material/MoreVert";
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import AddIcon from "@mui/icons-material/Add";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import SensorsOutlinedIcon from "@mui/icons-material/SensorsOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import GavelOutlinedIcon from "@mui/icons-material/GavelOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";

import RuleDetail from "./components/RuleDetail";
import TemplatePicker from "./components/TemplatePicker";
import ClockBar from "./components/ClockBar";
import {
  start, listRules, getRule, setRuleState, duplicateRule, deleteRule,
  runTick, getSummary, previewScanner, EVENT_MODULES,
  RULE_STATE_META, relativeTo, RUN_STATUS_META,
  advanceClock, advanceToNextJob, canEdit, canPublish, canAdvanceClock,
} from "./api/automationsApi";
import "./Automatizaciones.css";

const STATES = [
  { value: "", label: "Todos los estados" },
  { value: "publicada", label: "Publicadas" },
  { value: "pausada", label: "Pausadas" },
  { value: "borrador", label: "Borradores" },
];

const Automatizaciones = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();
  const role = user?.role || "";

  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const [search, setSearch] = useState("");
  const [state, setState] = useState("");
  const [module, setModule] = useState("");
  const [anchor, setAnchor] = useState(null);
  const [active, setActive] = useState(null);
  const [detail, setDetail] = useState(null);
  const [templates, setTemplates] = useState(false);

  // El motor se conecta al bus una sola vez; `start()` es idempotente.
  useEffect(() => { start(); }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rules = useMemo(() => listRules({ search, state, module }), [search, state, module, version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const summary = useMemo(() => getSummary(), [version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scannerPreview = useMemo(() => previewScanner(), [version]);

  const entering = scannerPreview.reduce((s, p) => s + p.entering, 0);
  const rulesById = Object.fromEntries(rules.map((r) => [r.id, r]));

  const handleAdvance = (ms) => {
    const result = advanceClock(ms, { role });
    if (!result.ok) { showToast(result.error, "warning"); return; }
    bump();
    showToast(
      result.executed.length
        ? `Reloj adelantado · ${result.executed.length} ejecución(es)`
        : "Reloj adelantado · no venció ningún trabajo",
      result.executed.length ? "success" : "info"
    );
  };

  const handleAdvanceToNext = () => {
    const result = advanceToNextJob({ role });
    if (!result.ok) { showToast(result.error, "warning"); return; }
    bump();
    showToast(result.note || `Reloj adelantado · ${result.executed.length} ejecución(es)`, "success");
  };

  const handleTick = () => {
    const executed = runTick();
    bump();
    showToast(
      executed.length
        ? `Ciclo corrido: ${executed.length} ejecución(es)`
        : "Ciclo corrido: nada que ejecutar (las condiciones ya disparadas no se repiten)",
      executed.length ? "success" : "info"
    );
  };

  const handleState = (rule, next) => {
    const result = setRuleState(rule.id, next, { role });
    setAnchor(null);
    if (!result.ok) { showToast(result.error, "error"); return; }
    bump();
    showToast(
      next === "publicada"
        ? "Automatización publicada"
        : `Automatización ${next === "pausada" ? "pausada" : "vuelta a borrador"}${result.droppedJobs ? ` · ${result.droppedJobs} trabajo(s) pendiente(s) descartado(s)` : ""}`,
      "success"
    );
  };

  const handleDelete = () => {
    const result = deleteRule(active.id, { role });
    setAnchor(null);
    if (!result.ok) { showToast(result.error, "error"); return; }
    bump();
    showToast("Automatización eliminada", "success");
  };

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Automatizaciones"
        subtitle="Evento → condición → acción. Una automatización no puede hacer nada que no puedas hacer a mano: cada acción llama a la misma función que usarías vos."
        actions={
          <>
            <Button variant="secondary" startIcon={<SensorsOutlinedIcon />} onClick={() => navigate("/automatizaciones/eventos")}>
              Bandeja de eventos
            </Button>
            <Button variant="secondary" startIcon={<HistoryOutlinedIcon />} onClick={() => navigate("/automatizaciones/historial")}>
              Historial
            </Button>
            <Button
              variant={summary.approvals ? "danger" : "secondary"}
              startIcon={<GavelOutlinedIcon />}
              onClick={() => navigate("/automatizaciones/aprobaciones")}
            >
              Aprobaciones{summary.approvals ? ` (${summary.approvals})` : ""}
            </Button>
            <Button variant="secondary" startIcon={<PlayArrowOutlinedIcon />} onClick={handleTick}>
              Correr un ciclo
            </Button>
            <Button variant="primary" startIcon={<AddIcon />} disabled={!canEdit(role)} onClick={() => setTemplates(true)}>
              Nueva automatización
            </Button>
          </>
        }
      />

      {/* ------------------------------------------------------- resumen */}
      <Box className="au-summary">
        <div className="au-summary__item">
          <strong>{summary.published}</strong>
          <span>publicadas</span>
        </div>
        <div className="au-summary__item">
          <strong>{summary.runs}</strong>
          <span>ejecuciones</span>
        </div>
        <div className={`au-summary__item ${summary.failed ? "is-bad" : ""}`.trim()}>
          <strong>{summary.failed}</strong>
          <span>fallidas o parciales</span>
        </div>
        <div className="au-summary__item">
          <strong>{summary.blocked}</strong>
          <span>bloqueadas por salvaguarda</span>
        </div>
        <div className="au-summary__item">
          <strong>{summary.tasks}</strong>
          <span>tareas abiertas</span>
        </div>
        <div className={`au-summary__item ${summary.approvals ? "is-bad" : ""}`.trim()}>
          <strong>{summary.approvals}</strong>
          <span>esperando aprobación</span>
        </div>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="El escáner dispara por flanco: sólo cuando un sujeto ENTRA en la condición. Si un SKU ya está bajo mínimo y sigue estándolo, no vuelve a avisar.">
          <span className={`au-chip ${entering ? "au-chip--warn" : ""}`.trim()}>
            {entering
              ? `${entering} sujeto(s) entrando en condición`
              : "Nada nuevo entrando en condición"}
          </span>
        </Tooltip>
      </Box>

      <Card className="entity-card">
        <ClockBar
          rulesById={rulesById}
          disabled={!canAdvanceClock(role)}
          onAdvance={handleAdvance}
          onAdvanceToNext={handleAdvanceToNext}
        />
      </Card>

      {/* ------------------------------------------------------ filtros */}
      <Box className="table-tabs">
        <TextField
          select size="small" label="Estado" value={state}
          onChange={(e) => setState(e.target.value)} sx={{ minWidth: 180 }}
        >
          {STATES.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
        </TextField>
        <TextField
          select size="small" label="Módulo del evento" value={module}
          onChange={(e) => setModule(e.target.value)} sx={{ minWidth: 200 }}
        >
          <MenuItem value="">Todos los módulos</MenuItem>
          {EVENT_MODULES.map((m) => <MenuItem key={m.key} value={m.key}>{m.label}</MenuItem>)}
        </TextField>
        <Box sx={{ flex: 1 }} />
        <TextField
          size="small" placeholder="Buscar automatización…"
          value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 240 }}
        />
      </Box>

      {/* -------------------------------------------------------- lista */}
      {rules.length === 0 ? (
        <Card className="entity-card">
          <Typography variant="body2" className="text-tertiary">
            No hay automatizaciones con ese filtro.
          </Typography>
        </Card>
      ) : (
        <Box className="au-list">
          {rules.map((r) => (
            <Card
              key={r.id}
              className={`entity-card au-rule au-rule--${r.state}`}
              role="button" tabIndex={0}
              onClick={() => navigate(`/automatizaciones/${r.id}`)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`/automatizaciones/${r.id}`); } }}
            >
              <Box className="au-rule__head">
                <Box className="au-rule__title">
                  <BoltOutlinedIcon sx={{ fontSize: 17 }} />
                  <strong>{r.name}</strong>
                  {r.system && (
                    <Tooltip title="De fábrica: no se elimina. Duplicala para editarla.">
                      <LockOutlinedIcon sx={{ fontSize: 12, color: "var(--text-tertiary)" }} />
                    </Tooltip>
                  )}
                </Box>
                <Box className="au-rule__badges">
                  <StatusBadge tone={RULE_STATE_META[r.state]?.tone} label={RULE_STATE_META[r.state]?.label} />
                  {r.tiers.includes("sensitive") && (
                    <Tooltip title="Usa una acción sensible: nunca se ejecuta sola, queda propuesta para aprobación.">
                      <span className="au-chip au-chip--warn">sensible</span>
                    </Tooltip>
                  )}
                  <IconButton
                    size="small" aria-label="acciones"
                    onClick={(e) => { e.stopPropagation(); setAnchor(e.currentTarget); setActive(r); }}
                  >
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Box>

              <p className="au-rule__sentence">{r.sentence}</p>

              <Box className="au-rule__foot">
                <span className="au-chip">{r.event?.kind === "state" ? "condición observada" : "evento"}</span>
                <span className="au-chip">{r.subjectLabel}</span>
                <span className="au-chip">{r.executionText}</span>
                <Box sx={{ flex: 1 }} />
                {r.stats.lastAt ? (
                  <span className="au-rule__last">
                    <StatusBadge
                      tone={RUN_STATUS_META[r.stats.lastStatus]?.tone}
                      label={RUN_STATUS_META[r.stats.lastStatus]?.label}
                      showDot={false}
                    />
                    {relativeTo(r.stats.lastAt)} · {r.stats.total} ejecución(es)
                    {r.stats.failed > 0 && <em> · {r.stats.failed} con error</em>}
                  </span>
                ) : (
                  <span className="au-rule__last au-rule__last--never">Nunca se disparó</span>
                )}
              </Box>
            </Card>
          ))}
        </Box>
      )}

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => { navigate(`/automatizaciones/${active.id}`); setAnchor(null); }}>Abrir en el builder</MenuItem>
        <MenuItem onClick={() => { setDetail(getRule(active.id)); setAnchor(null); }}>Ver detalle</MenuItem>
        {active?.state !== "publicada" && (
          <MenuItem disabled={!canPublish(role)} onClick={() => handleState(active, "publicada")}>Publicar</MenuItem>
        )}
        {active?.state === "publicada" && (
          <MenuItem disabled={!canPublish(role)} onClick={() => handleState(active, "pausada")}>Pausar</MenuItem>
        )}
        <MenuItem
          disabled={!canEdit(role)}
          onClick={() => {
            const result = duplicateRule(active.id, { role });
            setAnchor(null);
            if (!result.ok) { showToast(result.error, "warning"); return; }
            bump();
            showToast("Automatización duplicada", "success");
          }}
        >
          Duplicar
        </MenuItem>
        <MenuItem disabled={active?.system || !canEdit(role)} onClick={handleDelete}>Eliminar</MenuItem>
      </Menu>

      {templates && (
        <TemplatePicker
          onClose={() => setTemplates(false)}
          onPick={(templateId) => navigate(templateId ? `/automatizaciones/nueva?plantilla=${templateId}` : "/automatizaciones/nueva")}
        />
      )}

      {detail && (
        <Modal
          open onClose={() => setDetail(null)} maxWidth="sm"
          title={detail.name}
          subtitle={detail.description}
          actions={
            <>
              <Button variant="ghost" onClick={() => setDetail(null)}>Cerrar</Button>
              <Button variant="primary" startIcon={<EditOutlinedIcon />} onClick={() => navigate(`/automatizaciones/${detail.id}`)}>
                Abrir en el builder
              </Button>
            </>
          }
        >
          <RuleDetail rule={detail} />
        </Modal>
      )}

      <Typography variant="caption" className="text-tertiary">
        El motor corre dentro del panel: los eventos inmediatos se procesan al ocurrir, y las
        condiciones observadas cada vez que corrés un ciclo. Nada se ejecuta con el panel cerrado.
      </Typography>
    </Box>
  );
};

export default Automatizaciones;
