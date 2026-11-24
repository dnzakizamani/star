// ESLint flat config. Dipakai ESLint 9; `next lint` sudah deprecated di Next 15.5
// dan dihapus di Next 16, jadi script lint memanggil `eslint` langsung.
//
// eslint-config-next masih berbentuk eslintrc lama, jadi dibungkus FlatCompat.
// Hasil akhirnya setara preset "strict" yang biasa ditawarkan `next lint`:
// core-web-vitals + TypeScript.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // Server Action menerima input dari form; nama yang tidak dipakai tetap
      // perlu ditulis kalau posisinya di tengah daftar argumen.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];

export default config;