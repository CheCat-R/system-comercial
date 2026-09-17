/**
 * Detalle de una regla, en lectura.
 *
 * Muestra las tres piezas por separado —`CUANDO / SI / ENTONCES`— más el
 * contrato del evento y el estado de la marca de agua. En F2 esta misma
 * estructura se vuelve editable en el Builder; acá sirve para entender qué hace
 * una regla y por qué disparó (o no).
 */
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";

import StatusBadge from "../../../components/StatusBadge/StatusBadge";
import { ACTION_TIERS, getAction, watermarkOf, GUARDS } from "../api/automationsApi";

const Section = ({ label, children, hint }) => (
  <Box className="au-detail__section">
    <span className="au-detail__label">
      {label}
      {hint && <Tooltip title={hint}><em> ⓘ</em></Tooltip>}
    </span>
    <div className="au-detail__body">{children}</div>
  </Box>
);

const RuleDetail = ({ rule }) => {
  const event = rule.event;
  const watermark = watermarkOf(rule.id);

  return (
    <Box className="au-detail">
      <p className="au-detail__sentence">{rule.sentence}</p>

      <Section label="Cuando">
        <strong>{rule.triggerText}</strong>
        {event && (
          <Box className="au-detail__meta">
            <span className="au-chip">{event.kind === "state" ? "condición observada" : "evento del bus"}</span>
            <span className="au-chip">sujeto: {rule.subjectLabel}</span>
            <span className="au-chip au-chip--source">{event.emittedAt}</span>
          </Box>
        )}
        {event?.note && <p className="au-detail__note">{event.note}</p>}
      </Section>

      <Section
        label="Si"
        hint="Las condiciones se vuelven a evaluar en el momento de ejecutar, no cuando se emitió el evento."
      >
        {rule.conditionTexts[0] === "siempre" ? (
          <em className="text-tertiary">Sin condiciones: se ejecuta siempre que ocurra el disparador.</em>
        ) : (
          <ul className="au-detail__list">
            {rule.conditionTexts.map((t) => <li key={t}>{t}</li>)}
          </ul>
        )}
      </Section>

      <Section label="Entonces">
        <ul className="au-detail__list">
          {rule.actions.map((step, i) => {
            const action = getAction(step.key);
            const tier = ACTION_TIERS[action?.tier];
            return (
              <li key={`${step.key}-${i}`}>
                {rule.actionTexts[i]}
                {tier && (
                  <Tooltip title={tier.hint}>
                    <span className={`au-chip au-chip--${tier.key}`}>{tier.label}</span>
                  </Tooltip>
                )}
                {action?.calls && <em className="au-detail__calls">{action.calls}</em>}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section label="Ejecución">
        <Box className="au-detail__meta">
          <span className="au-chip">{rule.executionText}</span>
          <StatusBadge tone="neutral" label={`dedup ${rule.guards?.dedupeWindowHours ?? GUARDS.dedupeWindowHours} h`} showDot={false} />
          <StatusBadge tone="neutral" label={`máx ${rule.guards?.maxRunsPerTick ?? GUARDS.maxRunsPerTick} por ciclo`} showDot={false} />
        </Box>
      </Section>

      {event?.kind === "state" && (
        <Section
          label="Marca de agua"
          hint="Los sujetos que YA están dentro de la condición. El escáner dispara por flanco: mientras un sujeto siga acá, no vuelve a avisar."
        >
          {watermark.length === 0 ? (
            <em className="text-tertiary">Vacía: nadie está dentro de la condición todavía.</em>
          ) : (
            <Box className="au-detail__meta">
              {watermark.slice(0, 12).map((id) => <span className="au-chip" key={id}>{id}</span>)}
              {watermark.length > 12 && <span className="au-chip">+{watermark.length - 12}</span>}
            </Box>
          )}
        </Section>
      )}

      <Section label="Resultados">
        <Box className="au-detail__meta">
          <span className="au-chip">{rule.stats.total} ejecución(es)</span>
          <span className="au-chip">{rule.stats.ok} ok</span>
          {rule.stats.failed > 0 && <span className="au-chip au-chip--warn">{rule.stats.failed} con error</span>}
          {rule.stats.blocked > 0 && <span className="au-chip au-chip--warn">{rule.stats.blocked} bloqueadas</span>}
          {rule.stats.pending > 0 && <span className="au-chip au-chip--warn">{rule.stats.pending} esperando aprobación</span>}
        </Box>
      </Section>
    </Box>
  );
};

export default RuleDetail;
