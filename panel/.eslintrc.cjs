/* eslint-env node */
module.exports = {
  root: true,
  // `dist/` es la SALIDA del build, no código fuente: son dos bundles minificados
  // que ESLint marcaba con ~288 errores cada uno y tapaban por completo los de
  // `src/`. Ahora que la imagen de Docker se construye con `npm run build`, esa
  // carpeta existe siempre, así que el ruido era permanente.
  //
  // `dev-dist/` es lo mismo pero de `npm run dev`: el service worker que genera
  // vite-plugin-pwa en desarrollo (también minificado, también ignorado por git).
  ignorePatterns: ['dist', 'dev-dist', 'coverage'],
  env: { browser: true, es2021: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: 'detect' } },
  plugins: ['react-refresh'],
  rules: {
    // Apagada: avisaba (37 veces) de archivos que exportan un componente Y un hook o una
    // constante — el patrón de los contextos de este proyecto, a propósito. Solo afecta
    // cuánto granular es el refresco en caliente en desarrollo, no el comportamiento.
    'react-refresh/only-export-components': 'off',
    'react/prop-types': 'off',
  },
  overrides: [
    {
      // Herramientas que corren en Node, no en el navegador: la config de Vite
      // y los scripts de desarrollo (leen process.env, arrancan procesos).
      files: ['vite.config.js', 'scripts/**/*.{js,mjs}'],
      env: { node: true, browser: false },
    },
  ],
};
