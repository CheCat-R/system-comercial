/** Chat interno por sucursal (polling). Sólo existe en la distribuidora. */
import { httpClient } from "../../app/api/httpClient";

export const chatApi = {
  bootstrap: () => httpClient.get("/chat/bootstrap"),
  nuevos: (desde) => httpClient.get("/chat/mensajes", { params: { desde } }),
  enviar: ({ texto, paraUsuarioId }) => httpClient.post("/chat/mensajes", { texto, paraUsuarioId: paraUsuarioId || null }),
  leido: ({ canalUsuarioId, ultimoMensajeId }) => httpClient.post("/chat/leido", { canalUsuarioId: canalUsuarioId || null, ultimoMensajeId }),
};

/** Canal 0 = grupal del local; N = privado con el usuario N. */
export const canalDe = (m, yoId) => (m.paraUsuarioId == null ? 0 : (m.usuarioId === yoId ? m.paraUsuarioId : m.usuarioId));

export const hora = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hoy = new Date();
  const mismoDia = d.toDateString() === hoy.toDateString();
  const hm = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  return mismoDia ? hm : `${d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })} ${hm}`;
};
