import type { RunResult } from '@shared/types'
import {
  Ban,
  CircleCheck,
  CircleDashed,
  CircleX,
  type LucideIcon,
  TriangleAlert,
} from 'lucide-react'
import * as m from '../paraglide/messages'

export const RESULT_ICONS: Record<RunResult, LucideIcon> = {
  ok: CircleCheck,
  warning: TriangleAlert,
  error: CircleX,
  aborted: Ban,
  incomplete: CircleDashed,
}

export const getResultLabel = (result: RunResult): string => {
  switch (result) {
    case 'ok':
      return m.run_result_ok()
    case 'warning':
      return m.run_result_warning()
    case 'error':
      return m.run_result_error()
    case 'aborted':
      return m.run_result_aborted()
    case 'incomplete':
      return m.run_result_incomplete()
  }
}
