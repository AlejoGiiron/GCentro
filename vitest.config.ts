import { defineConfig } from 'vitest/config'
import path from 'path'

// Tests unitarios acotados a src/. Misma forma que en G-Vento, para que el
// comando y la ubicación de los tests sean iguales en los dos repos.
export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
