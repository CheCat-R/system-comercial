/**
 * Chat interno: un dock flotante abajo a la derecha. Canal grupal del local y
 * privados con cada compañero. Va por polling (hosting compartido, sin
 * sockets): al abrir se baja el historial y cada pocos segundos se piden los
 * mensajes nuevos desde el último id conocido.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Badge from "@mui/material/Badge";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutlineOutlined";
import CloseIcon from "@mui/icons-material/Close";
import SendIcon from "@mui/icons-material/Send";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import GroupsIcon from "@mui/icons-material/Groups";

import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../components/Toast/ToastContext";
import { QK } from "../../app/api/queryClient";
import { httpClient } from "../../app/api/httpClient";
import { chatApi, canalDe, hora } from "./chatApi";
import "./ChatDock.css";

const POLL_ABIERTO_MS = 4000;
const POLL_CERRADO_MS = 15000;

const ChatDock = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const yoId = user?.id;

  const [abierto, setAbierto] = useState(false);
  const [canal, setCanal] = useState(null); // null = lista de canales; 0 = local; N = privado
  const [texto, setTexto] = useState("");
  const [mensajes, setMensajes] = useState([]);
  const [lecturas, setLecturas] = useState({}); // canalUsuarioId -> ultimoMensajeId
  const [enLinea, setEnLinea] = useState([]);
  const listaRef = useRef(null);
  const ultimoId = mensajes.length ? mensajes[mensajes.length - 1].id : 0;

  // Historial inicial (también dice si esta sucursal tiene chat).
  const [boot, setBoot] = useState(null);
  const habilitado = boot?.habilitado === true;
  useEffect(() => {
    if (!yoId) return undefined;
    let vivo = true;
    chatApi.bootstrap().then((b) => {
      if (!vivo) return;
      setBoot(b);
      if (!b?.habilitado) return;
      setMensajes(b.mensajes || []);
      setLecturas(Object.fromEntries((b.lecturas || []).map((l) => [l.canalUsuarioId, l.ultimoMensajeId])));
      setEnLinea(b.enLinea || []);
    }).catch(() => {});
    return () => { vivo = false; };
  }, [yoId]);

  // Compañeros para los privados: la misma lista pública que usa el login.
  const opciones = useQuery({ queryKey: QK.opciones, queryFn: () => httpClient.get("/auth/opciones"), enabled: habilitado, staleTime: 5 * 60_000 });
  const companeros = useMemo(() => (opciones.data?.usuarios || []).filter((u) => u.id !== yoId), [opciones.data, yoId]);
  const nombreDe = (id) => (opciones.data?.usuarios || []).find((u) => u.id === id)?.nombre || `Usuario ${id}`;

  // Se marca leído hasta el último mensaje del canal que se está mirando.
  const marcarLeido = (c, hastaId) => {
    if (c == null || !hastaId) return;
    setLecturas((prev) => {
      if (hastaId <= (prev[c] || 0)) return prev;
      chatApi.leido({ canalUsuarioId: c, ultimoMensajeId: hastaId }).catch(() => {});
      return { ...prev, [c]: hastaId };
    });
  };

  // Polling de nuevos: más seguido con el dock abierto. El canal a la vista va
  // por ref para no rearmar el intervalo cada vez que se cambia de canal.
  const vistaRef = useRef({ abierto, canal });
  useEffect(() => { vistaRef.current = { abierto, canal }; }, [abierto, canal]);
  useEffect(() => {
    if (!habilitado) return undefined;
    let cancelado = false;
    const tick = async () => {
      try {
        const r = await chatApi.nuevos(ultimoId);
        if (cancelado) return;
        if (r.mensajes?.length) {
          setMensajes((prev) => { const ids = new Set(prev.map((m) => m.id)); return [...prev, ...r.mensajes.filter((m) => !ids.has(m.id))]; });
          const v = vistaRef.current;
          if (v.abierto && v.canal != null) {
            const delVisto = r.mensajes.filter((m) => canalDe(m, yoId) === v.canal);
            if (delVisto.length) marcarLeido(v.canal, delVisto[delVisto.length - 1].id);
          }
        }
        setEnLinea(r.enLinea || []);
      } catch { /* la próxima vuelta reintenta */ }
    };
    const t = setInterval(tick, abierto ? POLL_ABIERTO_MS : POLL_CERRADO_MS);
    return () => { cancelado = true; clearInterval(t); };
  }, [habilitado, abierto, ultimoId, yoId]);

  // Mensajes por canal y no leídos.
  const porCanal = useMemo(() => {
    const map = new Map();
    mensajes.forEach((m) => { const c = canalDe(m, yoId); if (!map.has(c)) map.set(c, []); map.get(c).push(m); });
    return map;
  }, [mensajes, yoId]);
  const noLeidos = (c) => (porCanal.get(c) || []).filter((m) => m.usuarioId !== yoId && m.id > (lecturas[c] || 0)).length;
  const totalNoLeidos = [...porCanal.keys()].reduce((a, c) => a + noLeidos(c), 0);

  const delCanal = canal == null ? [] : (porCanal.get(canal) || []);
  const abrirCanal = (c) => { setCanal(c); marcarLeido(c, (porCanal.get(c) || []).slice(-1)[0]?.id || 0); };

  useEffect(() => { if (listaRef.current) listaRef.current.scrollTop = listaRef.current.scrollHeight; }, [delCanal.length, canal, abierto]);

  const enviar = async () => {
    const t = texto.trim();
    if (!t || canal == null) return;
    setTexto("");
    try {
      const m = await chatApi.enviar({ texto: t, paraUsuarioId: canal || null });
      setMensajes((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      setLecturas((prev) => ({ ...prev, [canal]: m.id }));
    } catch (e) {
      setTexto(t);
      showToast(e?.message || "No se pudo enviar.", "error");
    }
  };

  if (!habilitado) return null;

  const estaEnLinea = (id) => enLinea.some((u) => u.id === id);
  const canales = [{ id: 0, nombre: "Local", sub: `${enLinea.length} en línea`, grupal: true }, ...companeros.map((u) => ({ id: u.id, nombre: u.nombre, sub: estaEnLinea(u.id) ? "en línea" : "", online: estaEnLinea(u.id) }))];
  const tituloCanal = canal === 0 ? "Local" : canal != null ? nombreDe(canal) : "Chat";

  return (
    <>
      <Tooltip title="Chat interno" placement="left">
        <IconButton className={`chat-dock__fab ${abierto ? "chat-dock__fab--open" : ""}`} onClick={() => { const ahora = !abierto; setAbierto(ahora); if (ahora && canal != null) abrirCanal(canal); }} aria-label="Chat interno">
          <Badge badgeContent={totalNoLeidos} color="error" max={99} invisible={!totalNoLeidos}>{abierto ? <CloseIcon /> : <ChatBubbleOutlineIcon />}</Badge>
        </IconButton>
      </Tooltip>

      {abierto && (
        <div className="chat-dock" role="dialog" aria-label="Chat interno">
          <div className="chat-dock__header">
            {canal != null && <IconButton size="small" onClick={() => setCanal(null)} aria-label="Volver"><ArrowBackIcon fontSize="small" /></IconButton>}
            <div className="chat-dock__title">
              <Typography variant="subtitle2" component="div">{tituloCanal}</Typography>
              <Typography variant="caption" className="text-tertiary" component="div">{canal == null ? `${user?.sucursalNombre || ""} · se guarda ${boot?.retencionHoras || 24} h` : canal === 0 ? `${enLinea.length} en línea` : estaEnLinea(canal) ? "en línea" : "ausente"}</Typography>
            </div>
            <IconButton size="small" onClick={() => setAbierto(false)} aria-label="Cerrar"><CloseIcon fontSize="small" /></IconButton>
          </div>

          {canal == null ? (
            <div className="chat-dock__channels">
              {canales.map((c) => (
                <button type="button" key={c.id} className="chat-dock__channel" onClick={() => abrirCanal(c.id)}>
                  <span className={`chat-dock__avatar ${c.grupal ? "chat-dock__avatar--group" : ""}`}>{c.grupal ? <GroupsIcon fontSize="small" /> : c.nombre.slice(0, 1).toUpperCase()}{c.online && <span className="chat-dock__dot" />}</span>
                  <span className="chat-dock__channel-body">
                    <span className="chat-dock__channel-name">{c.nombre}</span>
                    <span className="chat-dock__channel-sub">{(porCanal.get(c.id) || []).slice(-1)[0]?.texto || c.sub || "Sin mensajes"}</span>
                  </span>
                  {noLeidos(c.id) > 0 && <span className="chat-dock__unread">{noLeidos(c.id)}</span>}
                </button>
              ))}
              {!companeros.length && <Typography variant="caption" className="text-tertiary" sx={{ p: 2, display: "block" }}>Todavía no hay compañeros cargados.</Typography>}
            </div>
          ) : (
            <>
              <div className="chat-dock__messages" ref={listaRef}>
                {!delCanal.length && <Typography variant="caption" className="text-tertiary chat-dock__empty">Sin mensajes todavía. Escribí el primero.</Typography>}
                {delCanal.map((m) => {
                  const mio = m.usuarioId === yoId;
                  return (
                    <div key={m.id} className={`chat-dock__msg ${mio ? "chat-dock__msg--mine" : ""}`}>
                      {!mio && canal === 0 && <span className="chat-dock__msg-author">{m.usuarioNombre || nombreDe(m.usuarioId)}</span>}
                      <span className="chat-dock__msg-text">{m.texto}</span>
                      <span className="chat-dock__msg-time">{hora(m.fecha)}</span>
                    </div>
                  );
                })}
              </div>
              <form className="chat-dock__composer" onSubmit={(e) => { e.preventDefault(); enviar(); }}>
                <input className="chat-dock__input" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }} placeholder={canal === 0 ? "Mensaje para el local…" : `Mensaje para ${nombreDe(canal)}…`} maxLength={1000} autoFocus aria-label="Mensaje" />
                <IconButton size="small" type="submit" disabled={!texto.trim()} aria-label="Enviar" className="chat-dock__send"><SendIcon fontSize="small" /></IconButton>
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
};

export default ChatDock;
