/**
 * Roles y matriz de permisos, contra la API.
 *
 * El catálogo lo declara la API (`GET /roles/permisos`) en dos niveles:
 * SECCIONES (qué pantallas ve el rol) y ACCIONES (qué operaciones puede hacer
 * dentro de lo que ve). La matriz es editable: tildar y guardar. La API aplica
 * las dos reglas de repartir permisos —el comodín no se pide, y no se otorga
 * lo que no se tiene— y las devuelve como mensaje cuando se rompen.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Checkbox from "@mui/material/Checkbox";
import Tooltip from "@mui/material/Tooltip";

import CheckOutlinedIcon from "@mui/icons-material/CheckOutlined";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import Button from "../../components/Button/Button";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { QK } from "../../app/api/queryClient";
import { seguridadApi } from "./api/seguridadApi";
import { useEstadoDesde } from "../../hooks/useEstadoDesde";
import "./Seguridad.css";

const TONO_ROL = { superadmin: "danger", admin: "warning", cajero: "info", fraccionador: "success" };

const Roles = () => {
  const { showToast } = useToast();
  const { check } = useAuth();
  const qc = useQueryClient();
  const canManage = check("gerencia.usuarios");

  const [grupo, setGrupo] = useState("");
  const [nuevo, setNuevo] = useState(null);     // null | { nombre, descripcion }

  const roles = useQuery({ queryKey: QK.roles, queryFn: seguridadApi.roles });
  const catalogo = useQuery({ queryKey: QK.permisos, queryFn: seguridadApi.permisos });

  // { rolId: Set(claves) } sólo de los roles tocados. Cuando llegan roles nuevos del servidor, lo editado ya no vale.
  const [borrador, setBorrador] = useEstadoDesde(roles.data, () => ({}));

  const guardarRol = useMutation({
    mutationFn: ({ id, permisos }) => seguridadApi.editarRol(id, { permisos }),
    onSuccess: (_, { id }) => {
      showToast("Permisos guardados.", "success");
      setBorrador((b) => { const c = { ...b }; delete c[id]; return c; });
      qc.invalidateQueries({ queryKey: QK.roles });
      qc.invalidateQueries({ queryKey: QK.yo });
    },
    onError: (err) => showToast(err?.message || "No se pudo guardar.", "error"),
  });

  const crearRol = useMutation({
    mutationFn: (body) => seguridadApi.crearRol(body),
    onSuccess: () => { showToast("Rol creado.", "success"); setNuevo(null); qc.invalidateQueries({ queryKey: QK.roles }); },
    onError: (err) => showToast(err?.message || "No se pudo crear el rol.", "error"),
  });

  const borrarRol = useMutation({
    mutationFn: (id) => seguridadApi.borrarRol(id),
    onSuccess: () => { showToast("Rol borrado.", "info"); qc.invalidateQueries({ queryKey: QK.roles }); },
    onError: (err) => showToast(err?.message || "No se pudo borrar.", "error"),
  });

  const grupos = useMemo(() => (catalogo.data || []).filter((g) => !grupo || g.grupo === grupo), [catalogo.data, grupo]);

  /** Lo que tiene cada rol AHORA (borrador si se tocó, si no lo guardado). */
  const tiene = (rol, clave) => {
    if (rol.permisos?.includes("*")) return true;
    const set = borrador[rol.id];
    return set ? set.has(clave) : rol.permisos.includes(clave);
  };
  const editable = (rol) => canManage.allowed && !rol.permisos?.includes("*");
  const alternar = (rol, clave) => {
    if (!editable(rol)) return;
    setBorrador((b) => {
      const set = new Set(b[rol.id] ?? rol.permisos);
      if (set.has(clave)) set.delete(clave); else set.add(clave);
      return { ...b, [rol.id]: set };
    });
  };

  const filas = (roles.data || []);

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Roles y permisos"
        subtitle="Dos niveles: las SECCIONES dicen qué pantallas ve el rol; las ACCIONES, qué puede hacer dentro. Un módulo sin ninguna sección desaparece del menú."
        actions={(
          <Tooltip title={canManage.allowed ? "" : canManage.reason}>
            <span>
              <Button variant="secondary" startIcon={<AddOutlinedIcon />} disabled={!canManage.allowed} onClick={() => setNuevo({ nombre: "", descripcion: "" })}>
                Nuevo rol
              </Button>
            </span>
          </Tooltip>
        )}
      />

      <Box className="sec-roles">
        {filas.map((r) => {
          const tocado = Boolean(borrador[r.id]);
          return (
            <div className={`sec-role sec-role--${TONO_ROL[r.clave] || "info"}`} key={r.id}>
              <div className="sec-role__head">
                <strong>{r.nombre}</strong>
                <StatusBadge tone={TONO_ROL[r.clave] || "info"} label={r.permisos?.includes("*") ? "todo" : `${r.permisos.length} permisos`} showDot={false} />
              </div>
              <Typography variant="body2" color="text.secondary">{r.descripcion || "—"}</Typography>
              <div className="sec-role__users">
                <span>{r.usuarios ?? 0} usuario{r.usuarios === 1 ? "" : "s"}</span>
                {r.esSistema && <span className="sec-chip sec-chip--inline">sistema</span>}
              </div>
              {(tocado || (!r.esSistema && canManage.allowed)) && (
                <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
                  {tocado && (
                    <Button size="small" variant="primary" loading={guardarRol.isPending}
                      onClick={() => guardarRol.mutate({ id: r.id, permisos: [...borrador[r.id]] })}>
                      Guardar cambios
                    </Button>
                  )}
                  {tocado && <Button size="small" variant="ghost" onClick={() => setBorrador((b) => { const c = { ...b }; delete c[r.id]; return c; })}>Descartar</Button>}
                  {!r.esSistema && !tocado && (
                    <Button size="small" variant="danger" disabled={(r.usuarios ?? 0) > 0} onClick={() => borrarRol.mutate(r.id)}>Borrar</Button>
                  )}
                </Box>
              )}
            </div>
          );
        })}
      </Box>

      <Card className="entity-card">
        <Box className="table-tabs" sx={{ mb: 1 }}>
          <Typography className="card-title">Matriz de permisos</Typography>
          <Box sx={{ flex: 1 }} />
          <TextField select size="small" label="Módulo" value={grupo} onChange={(e) => setGrupo(e.target.value)} sx={{ minWidth: 200 }}>
            <MenuItem value="">Todos</MenuItem>
            {(catalogo.data || []).map((g) => <MenuItem key={g.grupo} value={g.grupo}>{g.grupo}</MenuItem>)}
          </TextField>
        </Box>

        <div className="sec-matrix__scroll">
          <table className="sec-matrix">
            <thead>
              <tr>
                <th>Permiso</th>
                <th>Nivel</th>
                {filas.map((r) => <th key={r.id} className="sec-matrix__role">{r.nombre}</th>)}
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => (
                [
                  <tr key={`g-${g.grupo}`}>
                    <td colSpan={2 + filas.length} style={{ background: "var(--bg-sunken)", fontWeight: 600 }}>{g.grupo}</td>
                  </tr>,
                  ...[...g.secciones.map((p) => ({ ...p, nivel: "sección" })), ...g.acciones.map((p) => ({ ...p, nivel: "acción" }))].map((p) => (
                    <tr key={p.clave}>
                      <td>
                        <div className="sec-matrix__perm">
                          <strong>{p.nombre}</strong>
                          <em><code className="sec-code">{p.clave}</code></em>
                        </div>
                      </td>
                      <td><StatusBadge tone={p.nivel === "sección" ? "info" : "warning"} label={p.nivel} showDot={false} /></td>
                      {filas.map((r) => (
                        <td key={r.id} className="sec-matrix__cell">
                          {r.permisos?.includes("*")
                            ? <CheckOutlinedIcon fontSize="small" className="is-yes" />
                            : <Checkbox size="small" checked={tiene(r, p.clave)} disabled={!editable(r)} onChange={() => alternar(r, p.clave)} />}
                        </td>
                      ))}
                    </tr>
                  )),
                ]
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={Boolean(nuevo)}
        onClose={() => setNuevo(null)}
        title="Nuevo rol"
        subtitle="Nace sin permisos: después se tildan en la matriz."
        actions={(
          <>
            <Button variant="ghost" onClick={() => setNuevo(null)}>Cancelar</Button>
            <Button variant="primary" loading={crearRol.isPending} onClick={() => crearRol.mutate({ nombre: nuevo.nombre, descripcion: nuevo.descripcion, permisos: [] })}>Crear</Button>
          </>
        )}
      >
        <Box className="sec-form">
          <TextField label="Nombre" size="small" required value={nuevo?.nombre ?? ""} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
          <TextField label="Descripción" size="small" value={nuevo?.descripcion ?? ""} onChange={(e) => setNuevo({ ...nuevo, descripcion: e.target.value })} />
        </Box>
      </Modal>
    </Box>
  );
};

export default Roles;
