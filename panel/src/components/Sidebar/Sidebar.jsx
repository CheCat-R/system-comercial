import { useState } from "react";
import { Link as RouterLink, useLocation } from "react-router-dom";
import { useTheme, useMediaQuery } from "@mui/material";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";

import { NAV_SECTIONS } from "../../app/navigation";
import "./Sidebar.css";

const drawerWidth = 264;

const menuSections = NAV_SECTIONS;

const Sidebar = ({ mobileOpen, onClose }) => {
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  // Toggles manuales del usuario. El submenú también se abre solo cuando la
  // ruta activa cae dentro de él (se combina al calcular `isSubmenuOpen`).
  const [userToggles, setUserToggles] = useState({});

  const handleToggleSubmenu = (text) => {
    setUserToggles((prev) => ({ ...prev, [text]: !prev[text] }));
  };

  const isSubmenuActiveByRoute = (item) =>
    Boolean(item.children) && location.pathname.startsWith(item.path) && item.path !== "/";

  const drawerContent = (
    <Box className="sidebar-container">
      <Box className="sidebar-brand-toolbar">
        <Box className="sidebar-brand-info">
          <Box className="sidebar-logo-icon">C</Box>
          <Box>
            <Typography variant="subtitle1" className="sidebar-brand-title">
              CheCAT Panel
            </Typography>
            <Typography variant="caption" className="sidebar-brand-subtitle">
              Enterprise
            </Typography>
          </Box>
        </Box>
        <Chip label="v2.5" size="small" variant="outlined" className="sidebar-version-badge" />
      </Box>

      <Box sx={{ overflow: "auto", flex: 1 }}>
        <List className="sidebar-nav-list" disablePadding>
          {menuSections.map((section) => (
            <Box key={section.title}>
              <div className="sidebar-section-header">{section.title}</div>
              {section.items.map((item) => {
                const hasChildren = item.children && item.children.length > 0;
                const isSubmenuOpen =
                  item.text in userToggles
                    ? Boolean(userToggles[item.text])
                    : isSubmenuActiveByRoute(item);

                // Un hijo "índice" (misma ruta que el padre) coincide exacto;
                // el resto por prefijo.
                const childMatches = (childPath) =>
                  childPath === item.path
                    ? location.pathname === item.path
                    : location.pathname.startsWith(childPath);

                const isParentActive =
                  !item.disabled && hasChildren && item.children.some((c) => childMatches(c.path));

                const isItemActive =
                  !item.disabled &&
                  !hasChildren &&
                  (item.path === "/" ? location.pathname === "/" : location.pathname.startsWith(item.path));

                if (hasChildren) {
                  return (
                    <Box key={item.text}>
                      <ListItemButton
                        selected={isParentActive}
                        aria-expanded={isSubmenuOpen}
                        disabled={item.disabled}
                        onClick={() => handleToggleSubmenu(item.text)}
                        className="sidebar-item-btn"
                      >
                        <ListItemIcon className="sidebar-item-icon">{item.icon}</ListItemIcon>
                        <ListItemText primary={item.text} />
                        {isSubmenuOpen ? (
                          <ExpandLessIcon fontSize="small" sx={{ color: "var(--text-tertiary)" }} />
                        ) : (
                          <ExpandMoreIcon fontSize="small" sx={{ color: "var(--text-tertiary)" }} />
                        )}
                      </ListItemButton>

                      <Collapse in={isSubmenuOpen} timeout="auto" unmountOnExit>
                        <List component="div" disablePadding>
                          {item.children.map((child) => (
                            <ListItemButton
                              key={child.text}
                              selected={!child.disabled && childMatches(child.path)}
                              aria-current={!child.disabled && childMatches(child.path) ? "page" : undefined}
                              disabled={child.disabled}
                              component={child.disabled ? "div" : RouterLink}
                              to={child.disabled ? undefined : child.path}
                              onClick={onClose}
                              className="sidebar-subitem-btn"
                            >
                              <ListItemText primary={child.text} />
                              {child.disabled && <span className="sidebar-soon">pronto</span>}
                            </ListItemButton>
                          ))}
                        </List>
                      </Collapse>
                    </Box>
                  );
                }

                return (
                  <ListItemButton
                    key={item.text}
                    selected={isItemActive}
                    aria-current={isItemActive ? "page" : undefined}
                    disabled={item.disabled}
                    component={!item.disabled ? RouterLink : "div"}
                    to={!item.disabled ? item.path : undefined}
                    onClick={onClose}
                    className="sidebar-item-btn"
                  >
                    <ListItemIcon className="sidebar-item-icon">{item.icon}</ListItemIcon>
                    <ListItemText primary={item.text} />
                  </ListItemButton>
                );
              })}
            </Box>
          ))}
        </List>
      </Box>
    </Box>
  );

  return (
    <Box component="nav" sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}>
      <Drawer
        variant={isMobile ? "temporary" : "permanent"}
        open={isMobile ? mobileOpen : true}
        onClose={onClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          "& .MuiDrawer-paper": {
            width: drawerWidth,
            boxSizing: "border-box",
            borderRight: "1px solid var(--border-subtle)",
          },
        }}
      >
        {drawerContent}
      </Drawer>
    </Box>
  );
};

export default Sidebar;