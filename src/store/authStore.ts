import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'
import { setSentryUserContext, clearSentryUserContext } from '@/lib/sentry'

/**
 * Cinco estados, no dos. TOTP es obligatorio (§8 del diseño), así que "hay
 * sesión" no alcanza para dejar entrar a nadie:
 *   - needs_enroll:   inició sesión pero no tiene un factor TOTP verificado.
 *   - needs_challenge: tiene factor verificado pero esta sesión está en aal1.
 *   - ready:          aal2 alcanzado — recién ahí se puede leer catálogo.
 */
export type AuthStatus = 'loading' | 'signed_out' | 'needs_enroll' | 'needs_challenge' | 'ready'

interface AuthState {
  session: Session | null
  status: AuthStatus
  /** Recalcula el estado a partir de una sesión nueva (login, logout, MFA). */
  refresh: (session: Session | null) => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  status: 'loading',
  refresh: async (session) => {
    set({ session })

    if (!session) {
      clearSentryUserContext()
      set({ status: 'signed_out' })
      return
    }

    setSentryUserContext({ userId: session.user.id })

    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (error) {
      // Sesión rara (token vencido a mitad de vuelo, etc.) — tratar como
      // deslogueado en vez de dejar la UI en un estado indefinido.
      set({ status: 'signed_out' })
      return
    }

    if (data.currentLevel === 'aal2') {
      set({ status: 'ready' })
    } else if (data.nextLevel === 'aal2') {
      // Hay un factor TOTP ya verificado de una sesión anterior: falta el
      // desafío de esta sesión, no el enrolamiento.
      set({ status: 'needs_challenge' })
    } else {
      set({ status: 'needs_enroll' })
    }
  },
}))
