/**
 * GERENCIA › CONFIGURACIÓN — el mapa, no un formulario más.
 * ============================================================================
 * No hay campos acá adentro: los 4 grupos de `ConfiguracionService` (empresa,
 * impresión, ventas, web) ya tienen su pantalla, cada uno al lado de lo que
 * configura — empresa/impresión en Sistema, las 26 opciones del mostrador en
 * Ventas › Configuración. Duplicarlos en una pantalla nueva de Gerencia sería
 * dos lugares para el mismo dato, que es exactamente lo que este sistema evita
 * en todos lados (un módulo, un dueño). Esto es el directorio para encontrarlos.
 */
import { useNavigate } from 'react-router-dom';
import BusinessIcon from '@mui/icons-material/Business';
import PrintIcon from '@mui/icons-material/Print';
import TuneIcon from '@mui/icons-material/Tune';
import { cx } from '@shared/utils/classNames.js';
import { PanelHead, Btn, s } from '@modules/productos/components/ui.jsx';

const DESTINOS = [
  {
    icon: BusinessIcon, titulo: 'Datos de la empresa', ruta: '/sistema', donde: 'Sistema › Empresa',
    desc: 'Nombre, CUIT, razón social, dirección, logo y color de marca — el membrete de todo lo que se imprime.',
  },
  {
    icon: PrintIcon, titulo: 'Impresión', ruta: '/sistema', donde: 'Sistema › Impresión',
    desc: 'Qué formato de papel usa cada documento: tickets, facturas, presupuestos, etiquetas y remitos.',
  },
  {
    icon: TuneIcon, titulo: 'Ventas y preferencias', ruta: '/ventas', donde: 'Ventas › Configuración',
    desc: 'Punto de venta, ARCA, cuenta corriente, redondeo, medios de pago, lector y balanza — las 26 opciones del mostrador.',
  },
];

export function ConfiguracionPanel() {
  const navigate = useNavigate();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--crm-space-4)' }}>
      <PanelHead
        title="Configuración"
        desc="Cada parámetro vive al lado de lo que configura, no acá — esto es el mapa para encontrarlos."
      />
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {DESTINOS.map((d) => {
          const Icon = d.icon;
          return (
            <div
              key={d.titulo}
              className={cx(s.card, s.cardPad)}
              style={{ flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon style={{ fontSize: 20, color: 'var(--crm-color-accent)' }} />
                <strong>{d.titulo}</strong>
              </div>
              <div className={s.hint} style={{ margin: 0, flex: 1 }}>{d.desc}</div>
              <Btn small variant="btn-ghost" onClick={() => navigate(d.ruta)}>Ir a {d.donde} →</Btn>
            </div>
          );
        })}
      </div>
    </div>
  );
}
