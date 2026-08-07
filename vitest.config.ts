import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

/**
 * Two projects, because the two kinds of test have almost nothing in common.
 *
 * The unit project is pure functions — scoring, dates, the question bank, the spiral.
 * It runs in node, needs no DOM, and is fast enough to run on every save.
 *
 * The component project exists because of what those tests could not see. Three bugs
 * in one week were invisible in source and obvious on screen: the confetti never fired
 * because a hydration render claimed the day, a perfect slider read drew as an empty
 * ring because one opaque mark covered another, and a radio group highlighted the
 * saved value instead of the selected one. Every one of them type-checked, linted, and
 * passed a green suite.
 *
 * Worse than missing them, the absence of this project made *verifying* fixes
 * unreliable. Two of those were confirmed by hand with a browser measurement that
 * raced a 150ms CSS transition, which produced a confident wrong answer twice in a row.
 * A rendered assertion does not race anything.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'component',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['./src/test/setup.ts'],
        },
      },
    ],
  },
})
