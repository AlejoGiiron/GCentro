import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().min(1, 'Ingresá tu correo').email('Correo inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
})

export type LoginInput = z.infer<typeof loginSchema>

export const totpCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Ingresá los 6 dígitos del código'),
})

export type TotpCodeInput = z.infer<typeof totpCodeSchema>
