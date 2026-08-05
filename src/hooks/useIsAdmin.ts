import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from '@/store/authStore'

/**
 * Verificación en vivo de RLS: si el usuario no tiene fila en `admins`, esta
 * consulta vuelve vacía (no un error) porque la política deniega la lectura
 * por completo. Es la comprobación de "sin fila en admins no se lee nada"
 * del Bloque 1, ejecutándose cada vez que alguien entra.
 */
export function useIsAdmin() {
  const userId = useAuthStore((s) => s.session?.user.id)

  return useQuery({
    queryKey: ['es-admin', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admins')
        .select('id')
        .eq('id', userId as string)
        .maybeSingle()

      if (error) throw error
      return data !== null
    },
    enabled: !!userId,
  })
}
