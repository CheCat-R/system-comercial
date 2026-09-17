/**
 * ⭐ El Automation Builder (§9.2).
 *
 * La columna izquierda **es la regla en castellano**, leída de arriba abajo:
 * `CUANDO → SI → ENTONCES`. El detalle vive en el inspector de la derecha, que
 * se **genera del schema** de cada paso. Es el mismo patrón que probó funcionar
 * en el Store Builder (outline + inspector), aplicado a otra gramática.
 *
 * Cuatro decisiones:
 *  1. Elegir el disparador **fija el tipo de sujeto**, y con él qué condiciones
 *     y acciones se pueden usar. Las que no aplican se ven **deshabilitadas con
 *     el motivo**, no escondidas.
 *  2. Si al cambiar el disparador algún paso deja de aplicar, **no se borra en
 *     silencio**: se marca, se explica y se bloquea la publicación hasta
 *     resolverlo. Borrar el trabajo de alguien sin avisar es peor que un error.
 *  3. **Borrador ↔ publicada**, como una página de Tienda. En borrador se puede
 *     simular pero nunca ejecuta.
 *  4. El **simulador** está al lado de Publicar, no escondido en un menú: es lo
 *     que hay que mirar antes de publicar.
 */
import { useState, useMemo, useEffect, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";

import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import PublishOutlinedIcon from "@mui/icons-material/PublishOutlined";
import PauseOutlinedIcon from "@mui/icons-material/PauseOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";

import ParamField from "./components/ParamField";
import ConditionEditor from "./components/ConditionEditor";
import StepPicker from "./components/StepPicker";
import SimulatorPanel from "./components/SimulatorPanel";
import {
  start, getRule, createRule, updateRule, setRuleState, simulateRule, draftFromTemplate,
  getEvent, getCondition, getAction, defaultParams, conditionRejection, actionRejection,
  describeAction, describeCondition, subjectLabel, ACTION_TIERS, RULE_STATE_META, DELAY_UNITS,
  EXECUTION_MODES, canEdit, canPublish, canUseSensitive,
} from "./api/automationsApi";
import "./Automatizaciones.css";

const EMPTY = {
  name: "",
  description: "",
  trigger: null,
  conditions: { match: "all", rules: [] },
  actions: [],
  execution: {
    mode: "immediate",
    delay: { value: 1, unit: "hours" },
    every: { value: 1, unit: "days" },
    at: { hour: 9 },
  },
  guards: { dedupeWindowHours: 24, maxRunsPerTick: 20 },
};

/**
 * Una fila de la regla. Va fuera del componente a propósito: declarada adentro,
 * React la trataría como un tipo nuevo en cada render y le reiniciaría el estado.
 */
const Row = ({ active, onClick, children, bad, tools }) => (
  <div
    className={`au-step ${active ? "is-active" : ""} ${bad ? "is-bad" : ""}`.trim()}
    role="button" tabIndex={0}
    onClick={onClick}
    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
  >
    <span className="au-step__text">{children}</span>
    {tools && <span className="au-step__tools">{tools}</span>}
  </div>
);

const Builder = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();
  const role = user?.role || "";
  const [params] = useSearchParams();

  const isNew = !id;

  const [draft, setDraft] = useState(() => {
    if (id) {
      const rule = getRule(id);
      if (rule) {
        const { name, description, trigger, conditions, actions, execution, guards } = rule;
        return { name, description, trigger, conditions, actions, execution: { ...EMPTY.execution, ...execution }, guards };
      }
    }
    const tpl = params.get("plantilla") ? draftFromTemplate(params.get("plantilla")) : null;
    return tpl ? { ...EMPTY, ...tpl, execution: { ...EMPTY.execution, ...tpl.execution } } : EMPTY;
  });

  const [ruleId, setRuleId] = useState(id || null);
  const [dirty, setDirty] = useState(isNew);
  const [sel, setSel] = useState({ kind: "meta" });
  const [picker, setPicker] = useState(null);
  const [simulation, setSimulation] = useState(null);
  const [version, setVersion] = useState(0);

  useEffect(() => { start(); }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const saved = useMemo(() => (ruleId ? getRule(ruleId) : null), [ruleId, version]);

  const set = useCallback((patch) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  }, []);

  const event = draft.trigger ? getEvent(draft.trigger.key) : null;
  const subjectType = event?.subjectType || null;

  /* ------------------------------------------------------ validación */

  // Sin `useMemo`: son dos recorridos de unos pocos elementos, y memoizarlos
  // sobre un borrador que cambia en cada tecla no compra nada.
  const invalid = (() => {
    const out = [];
    (draft.conditions?.rules || []).forEach((r, i) => {
      const rejection = conditionRejection(getCondition(r.field), subjectType);
      if (rejection) out.push({ kind: "condition", index: i, label: getCondition(r.field)?.label || r.field, reason: rejection });
    });
    draft.actions.forEach((a, i) => {
      const rejection = actionRejection(getAction(a.key), subjectType);
      if (rejection) out.push({ kind: "action", index: i, label: getAction(a.key)?.label || a.key, reason: rejection });
    });
    return out;
  })();

  const problems = (() => {
    const out = [];
    if (!draft.name.trim()) out.push("Falta el nombre.");
    if (!draft.trigger) out.push("Falta el disparador.");
    if (!draft.actions.length) out.push("No hace nada: agregá al menos una acción.");
    if (invalid.length) out.push(`${invalid.length} paso(s) no aplican al sujeto de la regla.`);
    return out;
  })();

  // Se llama `listo` y no `canPublish` para no confundirse con el permiso del
  // mismo nombre: una cosa es que la regla esté completa y otra que vos puedas
  // publicarla.
  const listo = problems.length === 0;

  /* ----------------------------------------------------------- acciones */

  const dropInvalid = () => {
    const badConditions = new Set(invalid.filter((i) => i.kind === "condition").map((i) => i.index));
    const badActions = new Set(invalid.filter((i) => i.kind === "action").map((i) => i.index));
    set({
      conditions: { ...draft.conditions, rules: draft.conditions.rules.filter((_, i) => !badConditions.has(i)) },
      actions: draft.actions.filter((_, i) => !badActions.has(i)),
    });
    setSel({ kind: "meta" });
    showToast("Se quitaron los pasos que no aplican", "info");
  };

  const persist = () => {
    if (!draft.name.trim()) { showToast("Poné un nombre antes de guardar.", "warning"); return null; }
    if (ruleId) {
      const result = updateRule(ruleId, draft, { role });
      if (!result.ok) { showToast(result.error, "warning"); return null; }
      setDirty(false);
      setVersion((v) => v + 1);
      return ruleId;
    }
    const result = createRule(draft, { role });
    if (!result.ok) { showToast(result.error, "warning"); return null; }
    setRuleId(result.rule.id);
    setDirty(false);
    navigate(`/automatizaciones/${result.rule.id}`, { replace: true });
    return result.rule.id;
  };

  const handleSave = () => {
    const savedId = persist();
    if (savedId) showToast("Guardada como borrador", "success");
  };

  const handlePublish = () => {
    const savedId = persist();
    if (!savedId) return;
    const result = setRuleState(savedId, "publicada", { role });
    if (!result.ok) { showToast(result.error, "error"); return; }
    setVersion((v) => v + 1);
    showToast("Automatización publicada — ya está escuchando", "success");
  };

  const handlePause = () => {
    const result = setRuleState(ruleId, "pausada", { role });
    if (!result.ok) { showToast(result.error, "error"); return; }
    setVersion((v) => v + 1);
    showToast(
      `Automatización pausada${result.droppedJobs ? ` · ${result.droppedJobs} trabajo(s) pendiente(s) descartado(s)` : ""}`,
      "success"
    );
  };

  const handleSimulate = () => {
    if (!draft.trigger) { showToast("Elegí un disparador antes de simular.", "warning"); return; }
    // Se simula el BORRADOR en pantalla, no lo último guardado: si no, el
    // simulador contestaría sobre una regla distinta de la que estás editando.
    const result = simulateRule({ ...draft, id: ruleId || "AU-DRAFT", state: "borrador" });
    if (!result) { showToast("No se pudo simular.", "error"); return; }
    setSimulation(result);
  };

  /* ------------------------------------------------ edición de pasos */

  const pickTrigger = (key) => {
    const nextEvent = getEvent(key);
    const scanDefaults = (nextEvent.scanParams || []).reduce((acc, p) => ({ ...acc, [p.key]: p.default }), {});
    set({ trigger: { kind: nextEvent.kind, key, params: scanDefaults } });
    setSel({ kind: "trigger" });
  };

  const addCondition = (key) => {
    const condition = getCondition(key);
    const op = condition.ops[0];
    const value = ["in", "not_in", "between"].includes(op) ? [] : "";
    set({ conditions: { ...draft.conditions, rules: [...draft.conditions.rules, { field: key, op, value }] } });
    setSel({ kind: "condition", index: draft.conditions.rules.length });
  };

  const addAction = (key) => {
    set({ actions: [...draft.actions, { key, params: defaultParams(key) }] });
    setSel({ kind: "action", index: draft.actions.length });
  };

  const updateCondition = (index, next) =>
    set({ conditions: { ...draft.conditions, rules: draft.conditions.rules.map((r, i) => (i === index ? next : r)) } });

  const removeCondition = (index) => {
    set({ conditions: { ...draft.conditions, rules: draft.conditions.rules.filter((_, i) => i !== index) } });
    setSel({ kind: "meta" });
  };

  const updateActionParams = (index, params) =>
    set({ actions: draft.actions.map((a, i) => (i === index ? { ...a, params } : a)) });

  const removeAction = (index) => {
    set({ actions: draft.actions.filter((_, i) => i !== index) });
    setSel({ kind: "meta" });
  };

  const moveAction = (index, delta) => {
    const next = [...draft.actions];
    const j = index + delta;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    set({ actions: next });
    setSel({ kind: "action", index: j });
  };

  /* ------------------------------------------------------- inspector */

  const renderInspector = () => {
    if (sel.kind === "trigger" && event) {
      return (
        <>
          <Box className="au-insp__head">
            <span className="au-detail__label">Disparador</span>
            <Button variant="ghost" onClick={() => setPicker("trigger")}>Cambiar</Button>
          </Box>

          <strong className="au-insp__title">{event.label}</strong>

          <Box className="au-detail__meta">
            <StatusBadge
              tone={event.kind === "state" ? "warning" : "info"}
              label={event.kind === "state" ? "condición observada" : "evento del bus"}
              showDot={false}
            />
            <span className="au-chip">sujeto: {subjectLabel(event.subjectType)}</span>
          </Box>

          <Box className="au-insp__contract">
            <span className="au-detail__label">Se emite en</span>
            <code>{event.emittedAt}</code>
            <span className="au-detail__label">Trae</span>
            <code>{Object.keys(event.payload).join(" · ")}</code>
          </Box>

          {event.note && <p className="au-detail__note">{event.note}</p>}

          {(event.scanParams || []).map((spec) => (
            <ParamField
              key={spec.key} spec={spec}
              value={draft.trigger.params?.[spec.key]}
              onChange={(value) => set({ trigger: { ...draft.trigger, params: { ...draft.trigger.params, [spec.key]: value } } })}
            />
          ))}

          {event.kind === "state" && (
            <p className="au-detail__note">
              El escáner dispara <strong>por flanco</strong>: sólo cuando un sujeto entra en la
              condición. Mientras siga adentro, no vuelve a avisar.
            </p>
          )}
        </>
      );
    }

    if (sel.kind === "condition") {
      const rule = draft.conditions.rules[sel.index];
      if (!rule) return <p className="au-insp__empty">Elegí un paso de la izquierda.</p>;
      const rejection = conditionRejection(getCondition(rule.field), subjectType);
      return (
        <>
          <Box className="au-insp__head">
            <span className="au-detail__label">Condición</span>
            <Button variant="ghost" onClick={() => removeCondition(sel.index)}>Quitar</Button>
          </Box>
          {rejection && (
            <Box className="au-note au-note--bad">
              <WarningAmberOutlinedIcon sx={{ fontSize: 16 }} />
              <span>{rejection}</span>
            </Box>
          )}
          <ConditionEditor rule={rule} onChange={(next) => updateCondition(sel.index, next)} />
        </>
      );
    }

    if (sel.kind === "action") {
      const step = draft.actions[sel.index];
      if (!step) return <p className="au-insp__empty">Elegí un paso de la izquierda.</p>;
      const action = getAction(step.key);
      const tier = ACTION_TIERS[action?.tier];
      const rejection = actionRejection(action, subjectType);
      return (
        <>
          <Box className="au-insp__head">
            <span className="au-detail__label">Acción</span>
            <Button variant="ghost" onClick={() => removeAction(sel.index)}>Quitar</Button>
          </Box>

          <strong className="au-insp__title">{action?.label || step.key}</strong>

          {tier && (
            <Box className="au-detail__meta">
              <span className={`au-chip au-chip--${tier.key}`}>{tier.label}</span>
              <span className="au-chip au-chip--source">{action.calls}</span>
            </Box>
          )}

          {rejection && (
            <Box className="au-note au-note--bad">
              <WarningAmberOutlinedIcon sx={{ fontSize: 16 }} />
              <span>{rejection}</span>
            </Box>
          )}

          {action?.tier === "sensitive" && (
            <Box className={`au-note ${canUseSensitive(role) ? "au-note--warn" : "au-note--bad"}`}>
              <LockOutlinedIcon sx={{ fontSize: 16 }} />
              <span>
                {canUseSensitive(role)
                  ? <>Esta acción <strong>no se ejecuta sola</strong>: cada vez que la regla dispare, queda como propuesta en la bandeja de aprobaciones.</>
                  : <>Tu rol <strong>no puede guardar reglas con acciones sensibles</strong> (§10). Quitala o pedile a Admin que la agregue.</>}
              </span>
            </Box>
          )}

          {action?.hint && <p className="au-detail__note">{action.hint}</p>}

          {(action?.params || []).length === 0 ? (
            <p className="au-insp__empty">Esta acción no lleva parámetros.</p>
          ) : (
            action.params.map((spec) => (
              <ParamField
                key={spec.key} spec={spec}
                value={step.params?.[spec.key]}
                onChange={(value) => updateActionParams(sel.index, { ...step.params, [spec.key]: value })}
              />
            ))
          )}

          <p className="au-detail__note">
            En los textos podés usar <code>{"{{order.total}}"}</code>, <code>{"{{account.name}}"}</code>,{" "}
            <code>{"{{event.payload.…}}"}</code> y <code>{"{{subject.id}}"}</code>.
          </p>
        </>
      );
    }

    // --- meta: nombre, ejecución y salvaguardas ---
    return (
      <>
        <span className="au-detail__label">La automatización</span>

        <TextField
          size="small" fullWidth label="Nombre" value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
        />
        <TextField
          size="small" fullWidth multiline rows={2} label="Qué resuelve"
          value={draft.description}
          onChange={(e) => set({ description: e.target.value })}
        />

        <span className="au-detail__label">Cuándo se ejecuta</span>
        <TextField
          size="small" fullWidth select label="Modo" value={draft.execution.mode}
          onChange={(e) => set({ execution: { ...draft.execution, mode: e.target.value } })}
        >
          {EXECUTION_MODES.map((m) => (
            <MenuItem key={m.value} value={m.value}>{m.label} — {m.hint}</MenuItem>
          ))}
        </TextField>

        {draft.execution.mode === "delay" && (
          <Box className="au-cond__range">
            <TextField
              size="small" type="number" label="Esperar"
              value={draft.execution.delay?.value ?? 1}
              onChange={(e) => set({ execution: { ...draft.execution, delay: { ...draft.execution.delay, value: Number(e.target.value) } } })}
            />
            <TextField
              size="small" select label="Unidad"
              value={draft.execution.delay?.unit ?? "hours"}
              onChange={(e) => set({ execution: { ...draft.execution, delay: { ...draft.execution.delay, unit: e.target.value } } })}
            >
              {DELAY_UNITS.map((u) => <MenuItem key={u.value} value={u.value}>{u.label}</MenuItem>)}
            </TextField>
          </Box>
        )}

        {draft.execution.mode === "schedule" && (
          <TextField
            size="small" fullWidth select label="A qué hora"
            value={draft.execution.at?.hour ?? 9}
            onChange={(e) => set({ execution: { ...draft.execution, at: { hour: Number(e.target.value) } } })}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <MenuItem key={h} value={h}>{String(h).padStart(2, "0")}:00</MenuItem>
            ))}
          </TextField>
        )}

        {draft.execution.mode === "recurring" && (
          <Box className="au-cond__range">
            <TextField
              size="small" type="number" label="Repetir cada"
              value={draft.execution.every?.value ?? 1}
              onChange={(e) => set({ execution: { ...draft.execution, every: { ...draft.execution.every, value: Number(e.target.value) } } })}
            />
            <TextField
              size="small" select label="Unidad"
              value={draft.execution.every?.unit ?? "days"}
              onChange={(e) => set({ execution: { ...draft.execution, every: { ...draft.execution.every, unit: e.target.value } } })}
            >
              {DELAY_UNITS.map((u) => <MenuItem key={u.value} value={u.value}>{u.label}</MenuItem>)}
            </TextField>
          </Box>
        )}

        {["delay", "schedule"].includes(draft.execution.mode) && (
          <p className="au-detail__note">
            Al vencer, las condiciones <strong>se vuelven a evaluar</strong> contra el estado de ese
            momento. Un recordatorio de «tu pedido sigue sin pagarse» sobre un pedido ya pagado es
            peor que no mandar nada.
          </p>
        )}

        {draft.execution.mode === "recurring" && (
          <p className="au-detail__note">
            Se repite <strong>mientras el sujeto siga cumpliendo las condiciones</strong>: cuando
            dejan de darse, la recurrencia termina sola. Y el intervalo hace de límite de frecuencia,
            así que la ventana de «no repetir» no se aplica a este modo.
          </p>
        )}

        <span className="au-detail__label">Salvaguardas</span>
        <Box className="au-cond__range">
          <TextField
            size="small" type="number" label="No repetir (horas)"
            value={draft.guards.dedupeWindowHours}
            onChange={(e) => set({ guards: { ...draft.guards, dedupeWindowHours: Number(e.target.value) } })}
          />
          <TextField
            size="small" type="number" label="Máx. por ciclo"
            value={draft.guards.maxRunsPerTick}
            onChange={(e) => set({ guards: { ...draft.guards, maxRunsPerTick: Number(e.target.value) } })}
          />
        </Box>
        <p className="au-detail__note">
          La ventana evita que la misma regla se ejecute dos veces sobre el mismo sujeto. El tope por
          ciclo acota el daño si una condición matchea de más.
        </p>
      </>
    );
  };

  /* ------------------------------------------------------------ render */

  return (
    <Box className="page fade-in">
      <PageHeader
        title={draft.name || "Nueva automatización"}
        subtitle="Se lee de arriba abajo: cuándo, si, entonces. El detalle de cada paso está a la derecha."
        actions={
          <>
            <Button variant="secondary" startIcon={<ScienceOutlinedIcon />} onClick={handleSimulate}>
              Simular
            </Button>
            <Tooltip title={canEdit(role) ? "" : "Crear y editar automatizaciones es de Admin, Dirección y Marketing."}>
              <span>
                <Button variant="secondary" startIcon={<SaveOutlinedIcon />} disabled={!canEdit(role)} onClick={handleSave}>
                  Guardar
                </Button>
              </span>
            </Tooltip>
            {saved?.state === "publicada" ? (
              <Button variant="secondary" startIcon={<PauseOutlinedIcon />} disabled={!canPublish(role)} onClick={handlePause}>
                Pausar
              </Button>
            ) : (
              <Tooltip title={!canPublish(role) ? "Publicar está reservado a Admin y Dirección (§10)." : (listo ? "" : problems.join(" "))}>
                <span>
                  <Button
                    variant="primary" startIcon={<PublishOutlinedIcon />}
                    disabled={!listo || !canPublish(role)} onClick={handlePublish}
                  >
                    Publicar
                  </Button>
                </span>
              </Tooltip>
            )}
          </>
        }
      />

      <Box className="au-dashbar">
        <Button variant="ghost" onClick={() => navigate("/automatizaciones")}>← Todas las automatizaciones</Button>
        {saved && <StatusBadge tone={RULE_STATE_META[saved.state]?.tone} label={RULE_STATE_META[saved.state]?.label} />}
        {dirty && <span className="au-chip au-chip--warn">sin guardar</span>}
        {subjectType && <span className="au-chip">sujeto: {subjectLabel(subjectType)}</span>}
        <Box sx={{ flex: 1 }} />
        {problems.length > 0 && (
          <Tooltip title={problems.join(" ")}>
            <span className="au-chip au-chip--warn">{problems.length} cosa(s) por resolver</span>
          </Tooltip>
        )}
      </Box>

      {invalid.length > 0 && (
        <Card className="entity-card au-note au-note--bad">
          <WarningAmberOutlinedIcon />
          <div>
            <strong>{invalid.length} paso(s) dejaron de aplicar al cambiar el disparador.</strong>
            <span>
              No se borraron solos: {invalid.map((i) => i.label).join(", ")}. Podés quitarlos o volver
              al disparador anterior.
            </span>
          </div>
          <Button variant="secondary" onClick={dropInvalid}>Quitar los que no aplican</Button>
        </Card>
      )}

      <Box className="au-builder">
        {/* ----------------------------------------------------- la regla */}
        <Card className="entity-card au-builder__rail">
          <Box className="au-rail__block">
            <span className="au-rail__label">Cuando</span>
            {draft.trigger && event ? (
              <Row active={sel.kind === "trigger"} onClick={() => setSel({ kind: "trigger" })}>
                {event.label}
              </Row>
            ) : (
              <button type="button" className="au-rail__add" onClick={() => setPicker("trigger")}>
                <AddIcon sx={{ fontSize: 15 }} /> Elegir el disparador
              </button>
            )}
          </Box>

          <Box className="au-rail__block">
            <Box className="au-rail__labelrow">
              <span className="au-rail__label">Si</span>
              {draft.conditions.rules.length > 1 && (
                <ToggleButtonGroup
                  size="small" exclusive value={draft.conditions.match}
                  onChange={(_, v) => v && set({ conditions: { ...draft.conditions, match: v } })}
                >
                  <ToggleButton value="all">se cumplen todas</ToggleButton>
                  <ToggleButton value="any">alguna</ToggleButton>
                </ToggleButtonGroup>
              )}
            </Box>

            {draft.conditions.rules.length === 0 && (
              <p className="au-rail__empty">Sin condiciones: se ejecuta siempre que ocurra el disparador.</p>
            )}

            {draft.conditions.rules.map((r, i) => (
              <Row
                key={`${r.field}-${i}`}
                active={sel.kind === "condition" && sel.index === i}
                bad={Boolean(conditionRejection(getCondition(r.field), subjectType))}
                onClick={() => setSel({ kind: "condition", index: i })}
                tools={
                  <IconButton size="small" aria-label="Quitar condición" onClick={(e) => { e.stopPropagation(); removeCondition(i); }}>
                    <CloseIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                }
              >
                {describeCondition(r)}
              </Row>
            ))}

            <button
              type="button" className="au-rail__add"
              disabled={!draft.trigger}
              onClick={() => setPicker("condition")}
            >
              <AddIcon sx={{ fontSize: 15 }} /> Agregar condición
            </button>
          </Box>

          <Box className="au-rail__block">
            <span className="au-rail__label">Entonces</span>

            {draft.actions.length === 0 && (
              <p className="au-rail__empty au-rail__empty--bad">
                Todavía no hace nada. Una regla sin acciones no se puede publicar.
              </p>
            )}

            {draft.actions.map((a, i) => {
              const action = getAction(a.key);
              return (
                <Row
                  key={`${a.key}-${i}`}
                  active={sel.kind === "action" && sel.index === i}
                  bad={Boolean(actionRejection(action, subjectType))}
                  onClick={() => setSel({ kind: "action", index: i })}
                  tools={
                    <>
                      {action?.tier === "sensitive" && (
                        <Tooltip title="Acción sensible: queda como propuesta para aprobar, no se ejecuta sola.">
                          <LockOutlinedIcon sx={{ fontSize: 13, color: "var(--danger-text)" }} />
                        </Tooltip>
                      )}
                      <IconButton size="small" disabled={i === 0} aria-label="Subir" onClick={(e) => { e.stopPropagation(); moveAction(i, -1); }}>
                        <ArrowUpwardIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                      <IconButton size="small" disabled={i === draft.actions.length - 1} aria-label="Bajar" onClick={(e) => { e.stopPropagation(); moveAction(i, 1); }}>
                        <ArrowDownwardIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                      <IconButton size="small" aria-label="Quitar acción" onClick={(e) => { e.stopPropagation(); removeAction(i); }}>
                        <CloseIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </>
                  }
                >
                  {describeAction(a)}
                </Row>
              );
            })}

            <button
              type="button" className="au-rail__add"
              disabled={!draft.trigger}
              onClick={() => setPicker("action")}
            >
              <AddIcon sx={{ fontSize: 15 }} /> Agregar acción
            </button>
          </Box>
        </Card>

        {/* ------------------------------------------------- el inspector */}
        <Card className="entity-card au-builder__inspector">
          <Box className="au-insp">
            {!draft.trigger && sel.kind !== "meta" ? (
              <p className="au-insp__empty">Elegí primero el disparador.</p>
            ) : renderInspector()}
          </Box>

          <Box className="au-insp__foot">
            <Button variant="ghost" onClick={() => setSel({ kind: "meta" })}>
              Ajustes de la automatización
            </Button>
          </Box>
        </Card>
      </Box>

      <Typography variant="caption" className="text-tertiary">
        Una regla en borrador se puede simular todas las veces que quieras, pero nunca ejecuta.
      </Typography>

      {picker && (
        <StepPicker
          mode={picker}
          subjectType={subjectType}
          onClose={() => setPicker(null)}
          onPick={(key) => {
            if (picker === "trigger") pickTrigger(key);
            else if (picker === "condition") addCondition(key);
            else addAction(key);
          }}
        />
      )}

      {simulation && <SimulatorPanel result={simulation} onClose={() => setSimulation(null)} />}
    </Box>
  );
};

export default Builder;
