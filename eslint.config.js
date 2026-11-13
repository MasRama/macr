import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
    { ignores: ['dist/', 'build/', '.test-build/', 'node_modules/'] },
    js.configs.recommended,
    tseslint.configs.recommended,
    {
        files: ['eslint.config.js', 'scripts/**/*.mjs'],
        languageOptions: { globals: globals.node },
    },
    {
        // GNOME Shell extensions in plain JavaScript run in GJS.
        files: ['tools/**/*.js'],
        languageOptions: { globals: { global: 'readonly', log: 'readonly' } },
    },
    {
        rules: {
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        },
    },
);
