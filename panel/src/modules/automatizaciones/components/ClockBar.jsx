/**
 * ⭐ El reloj simulado y la cola de trabajos (§2.5).
 *
 * **El panel no ejecuta nada mientras está cerrado**: no hay backend ni service
 * worker, y el estado se resetea con un reload. Eso hace que un retraso de 24
 * horas sea imposible de ver — y una automatización que no se puede ver no se
 * puede creer.
 *
 * Por eso el reloj se puede adelantar a mano. No es un truco de demo: es la
 * única forma de que "esperá 3 días y avisá" sea comprobable en dos minutos.
 */
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";

import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import FastForwardOutlinedIcon from "@mui/icons-material/FastForwardOutlined";

import Button from "../../../components/Button/Button";
import {
  now, formatStamp, relativeTo, pendingJobs, nextDueAt, CLOCK_STEPS, describeExecutionMode,
} from "../api/automationsApi";

const ClockBar = ({ onAdvance, onAdvanceToNext, disabled, rulesById = {} }) => {
  const jobs = pendingJobs();
  const next = nextDueAt();

  return (
    <Box className="au-clock">
      <Box className="au-clock__head">
        <ScheduleOutlinedIcon sx={{ fontSize: 17 }} />
        <div>
          <strong>{formatStamp(now().toISOString())}</strong>
          <span>reloj del motor</span>
        </div>

        <Box className="au-clock__steps">
          {CLOCK_STEPS.map((s) => (
            <Button key={s.label} variant="ghost" disabled={disabled} onClick={() => onAdvance(s.ms)}>
              {s.label}
            </Button>
          ))}
          <Tooltip title={next ? `Salta hasta ${formatStamp(next.toISOString())}` : "No hay trabajos en cola"}>
            <span>
              <Button
                variant="secondary" startIcon={<FastForwardOutlinedIcon />}
                disabled={disabled || !next}
                onClick={onAdvanceToNext}
              >
                Hasta el próximo
              </Button>
            </span>
          </Tooltip>
        </Box>
      </Box>

      {jobs.length === 0 ? (
        <p className="au-clock__empty">
          No hay trabajos en cola. Los modos con retraso, programado y recurrente encolan acá y se
          ejecutan cuando el reloj los alcanza.
        </p>
      ) : (
        <Box className="au-clock__jobs">
          <span className="au-detail__label">{jobs.length} trabajo(s) esperando</span>
          {jobs.slice(0, 8).map((j) => (
            <div className="au-clock__job" key={j.id}>
              <span className="au-clock__jobrule">
                {rulesById[j.ruleId]?.name || j.ruleId}
                <em>{j.subject?.id}</em>
              </span>
              <span className="au-chip">{describeExecutionMode(rulesById[j.ruleId]?.execution || { mode: j.kind })}</span>
              <span className="au-clock__due">
                {formatStamp(j.dueAt)}
                <em>{relativeTo(j.dueAt)}</em>
              </span>
            </div>
          ))}
          {jobs.length > 8 && <span className="au-clock__more">y {jobs.length - 8} más</span>}
        </Box>
      )}

      <p className="au-clock__note">
        Nada corre con el panel cerrado. Al vencer, un trabajo <strong>vuelve a evaluar sus
        condiciones</strong> contra el estado de ese momento.
      </p>
    </Box>
  );
};

export default ClockBar;
