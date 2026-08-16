/**
 * Las rutas, como datos. Sin componentes, para que cualquier pantalla pueda
 * construir un enlace sin importar el árbol de navegación.
 */
export const RUTAS = {
  lista: '/',
  suscripcion: (id: string) => `/suscripcion/${id}`,
  cola: '/cola',
} as const
