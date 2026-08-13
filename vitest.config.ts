import { defineConfig } from 'vitest/config'
import path from 'path'

// Tests unitarios de src/ MÁS el borde de la Edge Function. Misma forma que en
// G-Vento, para que el comando y la ubicación de los tests sean iguales en los
// dos repos.
//
// `supabase/functions/_shared` entra al include a propósito: ahí vive el
// contrato con G-Vento (traducción, firma HMAC, mapeo de errores), que es
// justo el código que no se puede dar por bueno mirándolo. Es TS puro —sin
// `Deno.*`, sin npm— precisamente para poder correr acá. El handler
// (`sincronizar-bandera/index.ts`) sí usa Deno y queda afuera: lo que hace es
// pegar piezas ya probadas, y probarlo pediría un runtime que no tenemos.
export default defineConfig({
  test: {
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'supabase/functions/_shared/**/*.{test,spec}.ts',
    ],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
