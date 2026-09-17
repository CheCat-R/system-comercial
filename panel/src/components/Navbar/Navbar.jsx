import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import IconButton from "@mui/material/IconButton";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import Tooltip from "@mui/material/Tooltip";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import Divider from "@mui/material/Divider";
import Chip from "@mui/material/Chip";

import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import SearchIcon from "@mui/icons-material/Search";
import MenuIcon from "@mui/icons-material/Menu";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import PersonOutlineIcon from "@mui/icons-material/PersonOutlineOutlined";

import { useThemeMode } from "../../theme/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { useUI } from "../../context/UIContext";
import { useToast } from "../Toast/ToastContext";
import "./Navbar.css";

const Navbar = ({ onMenuOpen }) => {
  const navigate = useNavigate();
  const { mode, toggleTheme } = useThemeMode();
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const { toggleCommandPalette, openNotifications } = useUI();

  const [anchorEl, setAnchorEl] = useState(null);
  const openProfileMenu = Boolean(anchorEl);

  const handleOpenUserMenu = (event) => setAnchorEl(event.currentTarget);
  const handleCloseUserMenu = () => setAnchorEl(null);

  const handleLogout = () => {
    handleCloseUserMenu();
    logout();
    showToast("Sesión cerrada", "info");
    navigate("/login");
  };

  const userInitial = user?.name ? user.name.charAt(0).toUpperCase() : "U";

  return (
    <AppBar position="sticky" className="navbar-appbar" elevation={0}>
      <Toolbar className="navbar-toolbar" disableGutters>
        <Box className="navbar-left">
          <IconButton
            edge="start"
            aria-label="abrir menú"
            onClick={onMenuOpen}
            className="navbar-menu-btn"
          >
            <MenuIcon />
          </IconButton>

          <button type="button" className="navbar-search" onClick={toggleCommandPalette}>
            <SearchIcon fontSize="small" />
            <span className="navbar-search__label">Buscar…</span>
            <span className="navbar-search__kbd">Ctrl&nbsp;K</span>
          </button>
        </Box>

        <Box className="navbar-right">
          <Tooltip title={mode === "dark" ? "Modo claro" : "Modo oscuro"}>
            <IconButton onClick={toggleTheme} aria-label="cambiar tema">
              {mode === "dark" ? (
                <LightModeOutlinedIcon fontSize="small" />
              ) : (
                <DarkModeOutlinedIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>

          <Tooltip title="Notificaciones">
            <IconButton onClick={openNotifications} aria-label="notificaciones">
              <Badge
                variant="dot"
                color="error"
                overlap="circular"
                anchorOrigin={{ vertical: "top", horizontal: "right" }}
              >
                <NotificationsNoneIcon fontSize="small" />
              </Badge>
            </IconButton>
          </Tooltip>

          <Box
            className="navbar-user"
            onClick={handleOpenUserMenu}
            role="button"
            tabIndex={0}
          >
            <Avatar className="navbar-user__avatar">{userInitial}</Avatar>
            <Box className="navbar-user__meta">
              <Typography className="navbar-user__name">{user?.name || "Usuario"}</Typography>
              <Typography className="navbar-user__role">{user?.role || "—"}</Typography>
            </Box>
          </Box>

          <Menu
            anchorEl={anchorEl}
            open={openProfileMenu}
            onClose={handleCloseUserMenu}
            onClick={handleCloseUserMenu}
            slotProps={{ paper: { sx: { mt: 1.5, minWidth: 220 } } }}
            transformOrigin={{ horizontal: "right", vertical: "top" }}
            anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
          >
            <Box sx={{ px: 2, py: 1.5 }}>
              <Typography variant="subtitle2" fontWeight={700} color="text.primary">
                {user?.name || "Usuario"}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                {user?.email || "usuario@checat.dev"}
              </Typography>
              <Chip
                label={user?.role || "Administrador"}
                size="small"
                variant="outlined"
                sx={{ mt: 1, height: 20, fontSize: "0.68rem" }}
              />
            </Box>

            <Divider />

            <MenuItem onClick={handleCloseUserMenu}>
              <ListItemIcon>
                <PersonOutlineIcon fontSize="small" />
              </ListItemIcon>
              Mi Perfil
            </MenuItem>

            <MenuItem onClick={handleLogout} sx={{ color: "error.main" }}>
              <ListItemIcon>
                <LogoutIcon fontSize="small" color="error" />
              </ListItemIcon>
              Cerrar Sesión
            </MenuItem>
          </Menu>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Navbar;
