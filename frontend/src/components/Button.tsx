import type { ComponentProps } from 'react'
import { Button as UiButton } from './ui/button'

type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'dangerOutline'
  | 'ghost'
  | 'ghostDanger'
type ButtonSize = 'sm' | 'md' | 'icon' | 'iconSm'

// The app's variant names on top of shadcn/ui's Button
const VARIANTS = {
  primary: 'default',
  secondary: 'outline',
  success: 'success',
  warning: 'warning',
  danger: 'destructive',
  dangerOutline: 'destructiveOutline',
  ghost: 'ghost',
  ghostDanger: 'ghostDestructive',
} as const

const SIZES = {
  sm: 'sm',
  md: 'default',
  icon: 'icon',
  iconSm: 'icon-sm',
} as const

interface ButtonProps
  extends Omit<ComponentProps<typeof UiButton>, 'variant' | 'size'> {
  variant?: ButtonVariant
  size?: ButtonSize
}

export const Button = ({
  variant = 'primary',
  size = 'md',
  ...props
}: ButtonProps) => (
  <UiButton variant={VARIANTS[variant]} size={SIZES[size]} {...props} />
)
