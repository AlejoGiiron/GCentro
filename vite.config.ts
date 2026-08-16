import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import path from 'path'

// La subida de source maps solo corre si hay token: el build local, y el de
// cualquiera sin credenciales de Sentry, sigue funcionando igual.
// SENTRY_AUTH_TOKEN va como variable de entorno del hosting — NUNCA al repo.
const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN
const subeSourceMaps = !!SENTRY_AUTH_TOKEN

export default defineConfig({
  plugins: [
    react(),
    // ⚠️ SIEMPRE al final del array: necesita ver el bundle ya generado.
    ...(subeSourceMaps
      ? [
          sentryVitePlugin({
            authToken: SENTRY_AUTH_TOKEN,
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            // Borra los .map del build DESPUÉS de subirlos: quedan en Sentry y
            // no en el hosting público. Es lo que hace que `sourcemap: 'hidden'`
            // sirva de algo sin exponer el código fuente.
            sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
            telemetry: false,
          }),
        ]
      : []),
  ],
  build: {
    // ⚠️ LA MISMA CONDICIÓN QUE AGREGA EL PLUGIN, a propósito.
    //
    // El que borra los `.map` del build es el plugin de Sentry, DESPUÉS de
    // subirlos. Sin token no se agrega, así que con `'hidden'` fijo los mapas
    // quedaban en `dist/` y el hosting los publicaba: el código fuente
    // completo del panel, legible desde devtools.
    //
    // Dos condiciones separadas para la misma decisión divergen — alguien
    // toca una y la otra queda mintiendo. Es la misma variable.
    //
    // `'hidden'` genera los `.map` pero NO escribe el comentario
    // `//# sourceMappingURL=`: el navegador no los pide y Sentry los usa
    // igual, porque los asocia por el debug id que inyecta el plugin.
    sourcemap: subeSourceMaps ? 'hidden' : false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
