import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Tooltip, Popover, Box, Typography, Stack,
} from '@mui/material';
import CircleIcon from '@mui/icons-material/Circle';
import InstallDesktopIcon from '@mui/icons-material/InstallDesktop';
import IosShareIcon from '@mui/icons-material/IosShare';
import AddBoxIcon from '@mui/icons-material/AddBox';
import { useNavigation } from '@core/navigation/useNavigation.js';
import { appConfig } from '@core/config/app.config.js';
import { useInstallPrompt } from '@core/pwa/useInstallPrompt.js';
import { cx } from '@shared/utils/classNames.js';
import { AvatarMarca, NombreMarca } from '@core/branding/Marca.jsx';
import styles from './Sidebar.module.css';

/**
 * "INSTALAR APP" — en el pie de la Sidebar, con texto, no un ícono suelto en
 * el Topbar: ahí nadie sabía que existía. Solo aparece cuando hay algo real
 * para ofrecer (`useInstallPrompt`) — Chrome/Edge disparan el diálogo nativo,
 * Safari (sin esa API) abre los pasos manuales.
 */
function InstalarAppBoton() {
  const { modo, instalar } = useInstallPrompt();
  const [anchorIOS, setAnchorIOS] = useState(null);

  if (!modo) return null;

  return (
    <>
      <button
        type="button"
        className={styles.navItem}
        style={{
          width: '100%', border: 'none', background: 'none', font: 'inherit', textAlign: 'left', cursor: 'pointer',
        }}
        onClick={modo === 'nativo' ? instalar : (e) => setAnchorIOS(e.currentTarget)}
      >
        <span className={styles.navIcon}><InstallDesktopIcon fontSize="small" /></span>
        <span className={styles.navLabel}>Instalar app</span>
      </button>
      <Popover
        open={Boolean(anchorIOS)}
        anchorEl={anchorIOS}
        onClose={() => setAnchorIOS(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ p: 2.5, maxWidth: 280 }}>
          <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Instalar en iPhone / iPad</Typography>
          <Stack spacing={1.25}>
            <Stack direction="row" spacing={1.25} alignItems="center">
              <IosShareIcon fontSize="small" color="action" />
              <Typography variant="body2">Tocá el botón Compartir, abajo en Safari.</Typography>
            </Stack>
            <Stack direction="row" spacing={1.25} alignItems="center">
              <AddBoxIcon fontSize="small" color="action" />
              <Typography variant="body2">Elegí &quot;Agregar a inicio&quot;.</Typography>
            </Stack>
          </Stack>
        </Box>
      </Popover>
    </>
  );
}

/**
 * The actual navigation content, shared by the desktop sidebar and the mobile
 * drawer so there is exactly one implementation of the nav list.
 *
 * Items come from `useNavigation()` (registry + permissions). This component
 * renders links; it never knows which modules exist.
 *
 * @param {{ collapsed?: boolean, onNavigate?: () => void }} props
 */
export function SidebarContent({ collapsed = false, onNavigate }) {
  const groups = useNavigation();

  return (
    <nav className={styles.nav} aria-label="Navegación principal">
      <div className={styles.brand}>
        <AvatarMarca size={38} className={styles.brandMark} />
        {!collapsed && <NombreMarca className={styles.brandName} />}
      </div>

      <div className={cx(styles.navScroll, 'crm-scroll-area')}>
        {groups.map((group) => (
          <div key={group.key} className={styles.group}>
            {!collapsed && <p className={styles.groupLabel}>{group.label}</p>}
            <ul role="list" className={styles.navList}>
              {group.items.map((item) => {
                const Icon = item.icon ?? CircleIcon;
                const link = (
                  <NavLink
                    to={item.path}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cx(styles.navItem, isActive && styles.navItemActive)
                    }
                  >
                    <span className={styles.navIcon}>
                      <Icon fontSize="small" />
                    </span>
                    {!collapsed && <span className={styles.navLabel}>{item.label}</span>}
                    {!collapsed && item.badgeCount > 0 && (
                      <span className={styles.navBadge}>{item.badgeCount}</span>
                    )}
                  </NavLink>
                );
                const tooltipTitle = item.badgeCount > 0
                  ? `${item.label} (${item.badgeCount} pendiente${item.badgeCount === 1 ? '' : 's'})`
                  : item.label;

                return (
                  <li key={item.id}>
                    {collapsed ? (
                      <Tooltip title={tooltipTitle} placement="right">
                        <span style={{ position: 'relative', display: 'block' }}>
                          {link}
                          {item.badgeCount > 0 && <span className={styles.navBadgeDot} />}
                        </span>
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {!collapsed && (
        <div className={styles.footer}>
          <InstalarAppBoton />
          <span className={styles.version}>v{appConfig.version}</span>
        </div>
      )}
    </nav>
  );
}
