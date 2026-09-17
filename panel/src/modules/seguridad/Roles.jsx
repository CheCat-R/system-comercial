/**
 * Roles y matriz de permisos (§7).
 *
 * Es la pantalla que contesta **"¿por qué pudo hacer esto?"** sin leer código:
 * cada permiso muestra su grado, el punto exacto donde se aplica y qué roles lo
 * incluyen.
 *
 * ⭐ La columna «se aplica en» es la que vuelve auditable al propio sistema de
 * permisos: un permiso declarado que nadie aplica es una mentira prolija, y acá
 * se ve cuál es cuál.
 */
import { useState, useMemo } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";

import CheckOutlinedIcon from "@mui/icons-material/CheckOutlined";
import RemoveOutlinedIcon from "@mui/icons-material/RemoveOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useAuth } from "../../context/AuthContext";

import {
  listRoles, usersByRole, permissionsByModule, permissionsBySurface, rolePermissions,
  coverage, getGrade, GRADES, getSecuritySummary, getBrokenContracts,
} from "./api/securityApi";
import "./Seguridad.css";

const Roles = () => {
  const { user } = useAuth();
  const [module, setModule] = useState("");
  const [grade, setGrade] = useState("");

  const roles = useMemo(() => listRoles(), []);
  const byRole = useMemo(() => usersByRole(), []);
  const groups = useMemo(() => permissionsByModule(), []);
  const surfaces = useMemo(() => permissionsBySurface(), []);
  const cov = useMemo(() => coverage(), []);
  const summary = useMemo(() => getSecuritySummary(), []);
  const broken = useMemo(() => getBrokenContracts(), []);

  const granted = useMemo(
    () => Object.fromEntries(roles.map((r) => [r.key, new Set(rolePermissions(r.key))])),
    [roles]
  );

  const visible = groups
    .filter((g) => !module || g.key === module)
    .map((g) => ({ ...g, permissions: g.permissions.filter((p) => !grade || p.grade === grade) }))
    .filter((g) => g.permissions.length);

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Roles y permisos"
        subtitle="El permiso es la unidad; el rol es un paquete con nombre. Agregar un rol no debería obligar a tocar código."
      />

      <Box className="sec-summary">
        <div className="sec-summary__item"><strong>{cov.total}</strong><span>permisos declarados</span></div>
        <div className="sec-summary__item"><strong>{cov.wired}</strong><span>ya aplicados en el api/</span></div>
        <div className="sec-summary__item"><strong>{cov.declared}</strong><span>declarados, sin aplicar</span></div>
        <div className="sec-summary__item"><strong>{cov.sensitive}</strong><span>con motivo o aprobación</span></div>
        <div className="sec-summary__item"><strong>{cov.stepUp}</strong><span>piden re-autenticarse</span></div>
        <div className="sec-summary__item"><strong>{summary.roles}</strong><span>roles</span></div>
      </Box>

      {broken.length > 0 && (
        <Card className="entity-card sec-broken">
          <strong>{broken.length} contrato(s) incompletos</strong>
          <span>{broken.join(" · ")}</span>
        </Card>
      )}

      <Card className="entity-card sec-note">
        <StatusBadge tone="warning" label="Lo declarado no es lo aplicado" showDot={false} />
        <span>
          <strong>{cov.wired} de {cov.total}</strong> permisos ya se resuelven en el punto que
          declaran; el resto está declarado con su <code className="sec-code">appliedAt</code> y
          todavía no se aplica ahí. Es el mismo dato honesto que <em>consumido</em> vs{" "}
          <em>declarado</em> en los puertos de Integraciones: se cablean al pasar el actor por los{" "}
          <code className="sec-code">api/</code> (F2) y al aplicar los grados (F3).
        </span>
      </Card>

      {/* ------------------------------------------------------- los roles */}
      <Card className="entity-card">
        <Box className="card-title-row">
          <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>Los roles</Typography>
          <Typography variant="caption" className="text-tertiary">un usuario tiene uno solo</Typography>
        </Box>

        <Box className="sec-roles">
          {byRole.map((r) => (
            <div className={`sec-role sec-role--${r.tone}`} key={r.key}>
              <div className="sec-role__head">
                <strong>{r.label}</strong>
                <span className="sec-chip">{r.permissionCount} permisos</span>
              </div>
              <em>{r.hint}</em>
              <div className="sec-role__users">
                {r.users.length === 0
                  ? <span className="text-tertiary">sin usuarios</span>
                  : r.users.map((u) => (
                    <span className="sec-chip" key={u.id}>
                      {u.name}{u.id === user?.id && " (vos)"}
                    </span>
                  ))}
              </div>
              {r.except?.length > 0 && (
                <div className="sec-role__except">
                  Excluye a propósito: {r.except.join(" · ")}
                </div>
              )}
            </div>
          ))}
        </Box>
      </Card>

      {/* -------------------------------------------------- las superficies */}
      <Card className="entity-card">
        <Box className="card-title-row">
          <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>Las ocho superficies vigiladas</Typography>
          <Typography variant="caption" className="text-tertiary">§4 de la spec</Typography>
        </Box>

        <Box className="sec-surfaces">
          {surfaces.map((s) => (
            <div className="sec-surface" key={s.key}>
              <strong>{s.label}</strong>
              <span className="sec-chip">{s.permissions.length} permiso(s)</span>
              <em>
                {s.permissions.length === 0
                  ? "Sin permisos declarados todavía."
                  : s.permissions.map((p) => p.label).join(" · ")}
              </em>
            </div>
          ))}
        </Box>
      </Card>

      {/* ------------------------------------------------------- la matriz */}
      <Box className="table-tabs">
        <TextField select size="small" label="Módulo" value={module} onChange={(e) => setModule(e.target.value)} sx={{ minWidth: 220 }}>
          <MenuItem value="">Todos</MenuItem>
          {groups.map((g) => <MenuItem key={g.key} value={g.key}>{g.label}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Grado" value={grade} onChange={(e) => setGrade(e.target.value)} sx={{ minWidth: 200 }}>
          <MenuItem value="">Todos</MenuItem>
          {Object.values(GRADES).map((g) => <MenuItem key={g.key} value={g.key}>{g.label}</MenuItem>)}
        </TextField>
      </Box>

      {visible.map((group) => (
        <Card className="entity-card" key={group.key}>
          <Typography variant="h6" className="card-title">{group.label}</Typography>

          <div className="sec-matrix__scroll">
            <table className="sec-matrix">
              <thead>
                <tr>
                  <th>Permiso</th>
                  <th>Grado</th>
                  <th>Se aplica en</th>
                  {roles.map((r) => <th key={r.key} className="sec-matrix__role">{r.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {group.permissions.map((p) => {
                  const g = getGrade(p.grade);
                  return (
                    <tr key={p.key}>
                      <td>
                        <Tooltip title={p.hint || ""}>
                          <div className="sec-matrix__perm">
                            <strong>{p.label}</strong>
                            <em>{p.key}</em>
                          </div>
                        </Tooltip>
                      </td>
                      <td>
                        <Tooltip title={g.hint}>
                          <span className={`sec-chip sec-chip--${g.tone}`}>{g.label}</span>
                        </Tooltip>
                        {p.stepUp && (
                          <Tooltip title="Pide volver a autenticarse aunque la sesión esté viva.">
                            <span className="sec-chip sec-chip--danger sec-chip--inline">step-up</span>
                          </Tooltip>
                        )}
                      </td>
                      <td>
                        <div className="sec-matrix__applied">
                          <code className="sec-code">{p.appliedAt}</code>
                          {p.wired
                            ? <span className="sec-chip sec-chip--success">aplicado</span>
                            : <span className="sec-chip">declarado</span>}
                        </div>
                      </td>
                      {roles.map((r) => (
                        <td key={r.key} className="sec-matrix__cell">
                          {granted[r.key].has(p.key)
                            ? <CheckOutlinedIcon className="is-yes" sx={{ fontSize: 15 }} />
                            : <RemoveOutlinedIcon className="is-no" sx={{ fontSize: 15 }} />}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </Box>
  );
};

export default Roles;
