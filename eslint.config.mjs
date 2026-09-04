import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

/**
 * Reglas de ESLint.
 *
 * El proyecto ya iba con `strict` y `noUncheckedIndexedAccess`, así que el
 * linter **no está para repetir lo que el compilador ya dice**. Está para lo
 * que el compilador no ve, que es sobre todo una cosa:
 * `react-hooks/exhaustive-deps`. Ese aviso es el que caza solo las cargas
 * asíncronas mal atadas —el defecto 2 de la hoja de ruta de calidad, cinco
 * vistas pintando la respuesta del juego anterior—.
 *
 * Lo demás va deliberadamente flojo. Un linter que grita por el formato en un
 * código que ya está bien escrito solo enseña a ignorar los avisos.
 */
export default tseslint.config(
  {
    ignores: [
      'node_modules/**', 'out/**', 'release/**', 'dist/**',
      '*.tsbuildinfo', 'resources/**', 'data/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    // El proyecto compila con `strict`: estas dos las dice mejor `tsc`, y aquí
    // solo duplicarían el mismo error con otra redacción.
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      // `require()` perezoso: lo usan el actualizador y el extractor de 7z a
      // propósito, y el porqué está escrito en cada sitio.
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // ── Proceso principal y preload ──────────────────────────────
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts', 'src/shared/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      /*
       * Un `catch` vacío en el main es cómo se pierde el motivo de un fallo que
       * el usuario sí nota. El proyecto no tenía ninguno; esto es para que siga
       * siendo verdad. Se admite el que lleva un comentario dentro, que es el
       * estilo que ya usa: decir por qué no se hace nada.
       */
      'no-empty': ['error', { allowEmptyCatch: false }],
    },
  },

  // ── Renderer ─────────────────────────────────────────────────
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // La razón de ser de este archivo. Ver la cabecera.
      'react-hooks/exhaustive-deps': 'error',
    },
  },

  // ── Arnés de pruebas y scripts ───────────────────────────────
  {
    files: ['test/**/*.{ts,tsx,mjs}', 'scripts/**/*.{mjs,cjs}', '*.cjs', '*.mjs', 'smoke-app.cjs'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
