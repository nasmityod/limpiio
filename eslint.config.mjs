// PRD-035: lint alineado con next@16 — `next lint` fue eliminado en Next 16;
// se usa ESLint CLI (v9, flat config) con eslint-config-next@16 (flat nativo, sin FlatCompat).
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = [
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Reglas del React Compiler (eslint-plugin-react-hooks v6): patrones válidos
      // en código existente — fetch/localStorage en mount, refs de sync, etc.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/static-components': 'off',
      // PRD-102: todos los <button> deben tener type explícito
      'react/button-has-type': ['error', { button: true, submit: true, reset: true }],
    },
  },
  {
    ignores: [
      'node_modules/**',
      // .next-staging / .next-previous / .next-validate: builds del deploy atómico
      '.next*/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
      // Scripts operativos / artefactos — no son código de la app
      'scripts/**',
      'docs/**',
      'prisma/migrations/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
];

export default eslintConfig;
