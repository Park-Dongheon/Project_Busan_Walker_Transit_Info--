import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/domains/**/*'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/domains/*/api',
                '@/domains/*/api/**',
                '@/domains/*/ui',
                '@/domains/*/ui/**',
                '@/domains/*/model',
                '@/domains/*/model/**',
                '@/domains/*/lib',
                '@/domains/*/lib/**',
                '@/domains/*/types',
                '@/domains/*/types/**',
              ],
              message:
                '도메인 외부에서는 루트 배럴(@/domains/<domain>)만 사용하세요. 도메인 내부(src/domains)는 예외입니다.',
            },
          ],
        },
      ],
    },
  },
])
