import Popover from "@mui/material/Popover";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import ListItemAvatar from "@mui/material/ListItemAvatar";
import Avatar from "@mui/material/Avatar";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import WarningIcon from "@mui/icons-material/Warning";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";

import { useUI } from "../../context/UIContext";
import {
  listNotifications, clearNotifications, relativeTo,
} from "../../modules/automatizaciones/api/automationsApi";
import "./NotificationCenter.css";

/**
 * El centro de notificaciones del panel.
 *
 * Hasta la F3 de Automatizaciones mostraba dos avisos escritos a mano. Ahora
 * muestra los **reales**: los que publican las automatizaciones con la acción
 * "Notificar en el panel", que es lo único del sistema que genera avisos para
 * una persona.
 */
const LEVELS = {
  info: { tone: "info", Icon: InfoOutlinedIcon },
  warning: { tone: "warning", Icon: WarningIcon },
  error: { tone: "danger", Icon: ErrorOutlineIcon },
};

const NotificationCenter = () => {
  const { isNotificationsOpen, closeNotifications, notificationAnchorEl } = useUI();

  // Se lee al abrir el popover: no hace falta suscribirse a nada.
  const items = isNotificationsOpen ? listNotifications().slice(0, 12) : [];

  return (
    <Popover
      open={isNotificationsOpen}
      anchorEl={notificationAnchorEl}
      onClose={closeNotifications}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      transformOrigin={{ vertical: "top", horizontal: "right" }}
      slotProps={{ paper: { className: "notification-popover" } }}
    >
      <Box className="notification-header">
        <Typography variant="h6">Notificaciones</Typography>
        {items.length > 0 && (
          <Typography
            variant="body2"
            className="notification-mark-read"
            role="button"
            tabIndex={0}
            onClick={() => { clearNotifications(); closeNotifications(); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); clearNotifications(); closeNotifications(); }
            }}
          >
            Marcar leídas
          </Typography>
        )}
      </Box>

      {items.length === 0 ? (
        <Box className="notification-empty">
          <Typography variant="body2">
            No hay avisos. Las automatizaciones publican acá cuando una regla usa
            «Notificar en el panel».
          </Typography>
        </Box>
      ) : (
        <List className="notification-list">
          {items.map((n) => {
            const level = LEVELS[n.level] || LEVELS.info;
            return (
              <ListItem className="notification-item unread" key={n.id}>
                <ListItemAvatar>
                  <Avatar className={`notification-avatar ${level.tone}`}>
                    <level.Icon fontSize="small" />
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={n.message}
                  secondary={`${n.subject?.id || ""} · ${relativeTo(n.at)}`}
                  slotProps={{
                    primary: { className: "notification-title" },
                    secondary: { className: "notification-time" },
                  }}
                />
              </ListItem>
            );
          })}
        </List>
      )}
    </Popover>
  );
};

export default NotificationCenter;
