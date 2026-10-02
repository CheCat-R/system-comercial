import { Box, Stack } from '@mui/material';
import { appConfig } from '@core/config/app.config.js';
import { Isotipo, NombreMarca } from './Marca.jsx';

/**
 * El lado de la MARCA del login (solo en pantallas anchas): isotipo grande,
 * las siglas y, debajo, el nombre completo en minúscula. Siempre oscuro —como
 * el menú lateral— tanto en tema claro como oscuro, así la marca se ve igual
 * y el formulario del otro lado se adapta al tema. Una marca de agua enorme
 * del isotipo, casi invisible, le da profundidad sin gradientes ni brillos.
 */
export function PanelMarca() {
  return (
    <Box
      sx={{
        display: { xs: 'none', md: 'flex' },
        position: 'relative',
        overflow: 'hidden',
        bgcolor: 'var(--crm-color-brand-panel)',
        color: 'var(--crm-color-brand-ink)',
        '--marca-sub': 'var(--crm-color-brand-ink-muted)',
        alignItems: 'center',
        justifyContent: 'center',
        p: 6,
      }}
    >
      <Box aria-hidden sx={{ position: 'absolute', right: -140, bottom: -150, opacity: 0.045, lineHeight: 0 }}>
        <Isotipo size={560} ojos="var(--crm-color-brand-panel)" />
      </Box>
      <Stack spacing={3.5} alignItems="flex-start" sx={{ position: 'relative' }}>
        <Isotipo size={132} titulo={`${appConfig.name} — ${appConfig.fullName}`} />
        <NombreMarca tamano="grande" />
      </Stack>
    </Box>
  );
}
