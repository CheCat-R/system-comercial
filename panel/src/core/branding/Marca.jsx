import { appConfig } from '@core/config/app.config.js';
import styles from './Marca.module.css';

/**
 * LA MARCA DEL SISTEMA — un solo lugar para el isotipo y el nombre.
 * ============================================================================
 * El isotipo va INCRUSTADO como SVG (no con `<img>`): así hereda el color del
 * contenedor con `currentColor` y un solo dibujo sirve en el tema claro y en
 * el oscuro, y sobre cualquier fondo. Dentro de un `<img>` el SVG queda
 * aislado y la silueta saldría negra sobre negro (ver `logo-ecommerce/README`).
 * Los ojos son siempre amarillos: son el color de la marca.
 *
 * El nombre se muestra así a propósito: las siglas **CCS** grandes y el nombre
 * completo en minúscula y chico, solo para que quien lo ve sepa qué significan.
 * Los dos textos salen de `appConfig` (marca fija del producto), no se tipean acá.
 */

/**
 * El dibujo solo, de color `currentColor`. Decorativo por defecto (el texto de
 * al lado ya dice la marca). `ojos` cambia el color de los ojos: por defecto
 * son el amarillo de la marca; en una marca de agua conviene que sean del
 * color del fondo (calados), porque un amarillo casi transparente se ve sucio.
 */
export function Isotipo({ size = 48, titulo, className, ojos = '#FFD400' }) {
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      role={titulo ? 'img' : undefined}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
      focusable="false"
    >
      <g fill="currentColor">
        <rect x="84" y="170" width="344" height="298" rx="28" />
        <path d="M84 196 L90 44 C90 44 158 92 190 178 Z" />
        <path d="M428 196 L422 44 C422 44 354 92 322 178 Z" />
      </g>
      <path d="M198 172 C198 86 314 86 314 172" fill="none" stroke="currentColor" strokeWidth="24" strokeLinecap="round" />
      <g fill={ojos} transform="translate(94,137) scale(0.62)">
        <path d="M302.713 369.764C440.213 302.264 451.713 210.828 418.713 190.764C362.713 156.716 282.713 271.264 302.713 369.764Z" />
        <path d="M221.713 363.764C180.213 350.764 73.7125 266.264 123.213 235.264C174.788 202.964 211.213 300.764 221.713 363.764Z" />
      </g>
    </svg>
  );
}

/**
 * El "avatar" cuadrado de la marca (el del favicon): silueta blanca con los
 * ojos grandes sobre el color de acento del tema. Es el de la barra lateral.
 */
export function AvatarMarca({ size = 36, className }) {
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} className={className} aria-hidden="true" focusable="false">
      <rect width="512" height="512" rx="112" fill="var(--crm-color-primary)" />
      <g transform="translate(72,86) scale(0.72)">
        <g fill="#FFFFFF">
          <rect x="84" y="170" width="344" height="298" rx="28" />
          <path d="M84 196 L90 44 C90 44 158 92 190 178 Z" />
          <path d="M428 196 L422 44 C422 44 354 92 322 178 Z" />
        </g>
        <g fill="#FFD400" transform="translate(73,116) scale(0.70)">
          <path d="M302.713 369.764C440.213 302.264 451.713 210.828 418.713 190.764C362.713 156.716 282.713 271.264 302.713 369.764Z" />
          <path d="M221.713 363.764C180.213 350.764 73.7125 266.264 123.213 235.264C174.788 202.964 211.213 300.764 221.713 363.764Z" />
        </g>
      </g>
    </svg>
  );
}

/**
 * Las siglas y, debajo, el nombre completo en minúscula.
 * `tamano`: 'chico' (barra lateral) | 'grande' (login).
 */
export function NombreMarca({ tamano = 'chico', className }) {
  return (
    <span className={[styles.nombre, styles[tamano], className].filter(Boolean).join(' ')}>
      <span className={styles.siglas}>{appConfig.name}</span>
      <span className={styles.completo}>{appConfig.fullName}</span>
    </span>
  );
}
