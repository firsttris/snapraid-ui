import type { ButtonHTMLAttributes } from 'react'

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

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300',
  secondary:
    'border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50',
  success: 'bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-300',
  warning: 'bg-orange-600 text-white hover:bg-orange-700 disabled:bg-gray-300',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-300',
  dangerOutline:
    'border border-red-300 bg-white text-red-700 hover:bg-red-50 disabled:opacity-50',
  ghost:
    'text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50',
  ghostDanger:
    'text-red-600 enabled:hover:bg-red-50 enabled:hover:text-red-700 disabled:opacity-40',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2',
  icon: 'p-2',
  iconSm: 'p-1.5',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

export const Button = ({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className = '',
  ...props
}: ButtonProps) => (
  <button
    type={type}
    className={`inline-flex items-center justify-center gap-2 rounded transition enabled:active:scale-[0.97] disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    {...props}
  />
)
