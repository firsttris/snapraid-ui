import { FORCE_FLAGS, type ForceOption } from '@shared/force-option'
import { ShieldAlert } from 'lucide-react'
import { getCommandLabel } from '../lib/commands'
import * as m from '../paraglide/messages'
import { useFeedback } from './Feedback'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import { Button } from './ui/button'

const TEXT: Record<
  ForceOption,
  { title: () => string; message: () => string }
> = {
  zero: { title: m.force_zero_title, message: m.force_zero_msg },
  empty: { title: m.force_empty_title, message: m.force_empty_msg },
  uuid: { title: m.force_uuid_title, message: m.force_uuid_msg },
}

/**
 * SnapRAID stopped a run because it looks like data loss. Explains why and runs it anyway
 * with the switch SnapRAID named, after a confirmation.
 */
export const ForceRetryBox = ({
  command,
  option,
  disabled,
  onRetry,
}: {
  command: string
  option: ForceOption
  disabled: boolean
  onRetry: (flag: string) => void
}) => {
  const { confirm } = useFeedback()
  const { title, message } = TEXT[option]
  const flag = FORCE_FLAGS[option]
  const label = getCommandLabel(command)

  const retry = async () => {
    const confirmed = await confirm({
      title: title(),
      message: m.force_confirm({ command: label, flag }),
      confirmLabel: m.force_retry({ command: label }),
      danger: true,
    })
    if (confirmed) onRetry(flag)
  }

  return (
    <Alert variant="destructive">
      <ShieldAlert />
      <AlertTitle className="font-semibold">{title()}</AlertTitle>
      <AlertDescription>
        <p>{message()}</p>
        <Button
          variant="destructiveOutline"
          size="sm"
          disabled={disabled}
          onClick={retry}
          className="mt-2"
        >
          {m.force_retry({ command: label })}
        </Button>
      </AlertDescription>
    </Alert>
  )
}
