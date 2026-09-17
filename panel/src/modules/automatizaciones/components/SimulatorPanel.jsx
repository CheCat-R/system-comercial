/**
 * ⭐ El simulador (dry-run) — §9.3.
 *
 * Corre **el mismo camino** que la ejecución real —mismo `runRule`, mismas
 * condiciones, mismo orden— pero sin llamar a ningún `api/`: cada acción se
 * describe con su `preview()`. Sobre un dataset mock es la única forma de
 * confiar en una regla antes de publicarla.
 *
 * Responde tres preguntas, en este orden de importancia:
 *   1. ¿A cuántos sujetos alcanzaría hoy?
 *   2. ¿Qué haría exactamente con cada uno?
 *   3. Si no dispara, **¿qué condición lo está frenando?**
 */
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";

import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";

import Modal from "../../../components/Modal/Modal";
import Button from "../../../components/Button/Button";
import StatusBadge from "../../../components/StatusBadge/StatusBadge";
import { STEP_STATUS_META } from "../api/automationsApi";

/**
 * ⭐ Placeholders que no resolvieron contra este sujeto.
 *
 * `interpolate` deja intacto lo que no encuentra, que es lo correcto —inventar
 * un valor sería peor— pero en la vista previa se lee como texto literal y pasa
 * desapercibido. Este chequeo lo encontró en la primera prueba real: una regla
 * sobre SKUs con `{{order.customerName}}` en el título habría creado tres tareas
 * con esa llave escrita tal cual.
 */
const unresolved = (text = "") => [...String(text).matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]);

const SimulatorPanel = ({ result, onClose }) => {
  if (!result) return null;

  const { rule, candidates, matched, discarded, topBlockers, runs, note } = result;

  return (
    <Modal
      open onClose={onClose} maxWidth="sm"
      title={`Simulación · ${rule.name}`}
      subtitle="No se ejecuta nada: cada acción se describe. Queda registrada en el historial como «Simulada»."
      actions={<Button variant="ghost" onClick={onClose}>Cerrar</Button>}
    >
      <Box className="au-sim">
        <Box className="au-sim__stats">
          <div className="au-sim__stat">
            <strong>{candidates}</strong>
            <span>candidatos</span>
          </div>
          <div className="au-sim__stat is-good">
            <strong>{matched}</strong>
            <span>dispararían</span>
          </div>
          <div className="au-sim__stat">
            <strong>{discarded}</strong>
            <span>descartados por condiciones</span>
          </div>
        </Box>

        <p className="au-sim__note">{note}</p>

        {candidates === 0 && (
          <Box className="au-note">
            <span>
              {rule.event?.kind === "state"
                ? "Ningún sujeto cumple la condición ahora mismo. La regla no está rota: no hay a quién aplicarla."
                : "Ese evento todavía no pasó por el bus en esta sesión. Provocá la operación real, o emitilo a mano desde la Bandeja de eventos."}
            </span>
          </Box>
        )}

        {topBlockers?.length > 0 && (
          <Box className="au-sim__blockers">
            <span className="au-detail__label">Qué está frenando la regla</span>
            {topBlockers.map((b) => (
              <div className="au-sim__blocker" key={b.label}>
                <span>{b.label}</span>
                <strong>{b.count} descarte(s)</strong>
              </div>
            ))}
          </Box>
        )}

        {runs.length > 0 && (
          <Box className="au-sim__runs">
            <span className="au-detail__label">Sujeto por sujeto</span>
            {runs.map((r) => (
              <div className={`au-sim__run ${r.status === "simulada" ? "is-match" : "is-skip"}`} key={r.id}>
                <div className="au-sim__runhead">
                  {r.status === "simulada"
                    ? <CheckIcon sx={{ fontSize: 15 }} />
                    : <CloseIcon sx={{ fontSize: 15 }} />}
                  <strong>{r.subjectLabel || r.subject?.id}</strong>
                  {r.status !== "simulada" && (
                    <Tooltip title={r.reason || ""}>
                      <em>{r.reason}</em>
                    </Tooltip>
                  )}
                </div>

                {r.status === "simulada" && (
                  <ul className="au-sim__steps">
                    {r.steps.map((s, i) => {
                      const missing = unresolved(s.detail);
                      return (
                        <li key={`${s.key}-${i}`}>
                          <StatusBadge
                            tone={STEP_STATUS_META[s.status]?.tone}
                            label={s.tier === "sensitive" ? "A aprobar" : "Haría"}
                            showDot={false}
                          />
                          <span>
                            {s.detail}
                            {missing.length > 0 && (
                              <Tooltip title={`Este sujeto no tiene ${missing.join(", ")}. Se escribiría la llave tal cual, sin reemplazar.`}>
                                <em className="au-sim__missing">
                                  {missing.length} campo(s) sin resolver
                                </em>
                              </Tooltip>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </Box>
        )}
      </Box>
    </Modal>
  );
};

export default SimulatorPanel;
