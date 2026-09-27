import { useState } from 'react'
import * as m from '../paraglide/messages'
import {
  DEFAULT_SCRUB_OPTIONS,
  isValidScrubOptions,
  type ScrubOptions,
  ScrubPlanPicker,
  scrubArgs,
} from './ScrubPlanPicker'

interface ScrubDialogProps {
  badBlocks: number
  onClose: () => void
  onConfirm: (args: string[]) => void
}

export const ScrubDialog = ({
  badBlocks,
  onClose,
  onConfirm,
}: ScrubDialogProps) => {
  const [options, setOptions] = useState<ScrubOptions>({
    ...DEFAULT_SCRUB_OPTIONS,
    plan: badBlocks > 0 ? 'bad' : 'default',
  })

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold">{m.scrub_dialog_title()}</h2>
        </div>

        <div className="p-6 overflow-y-auto space-y-4">
          <p className="text-gray-700">{m.scrub_dialog_intro()}</p>

          {badBlocks > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              ⚠️ {m.scrub_bad_blocks_hint({ count: badBlocks })}
            </div>
          )}

          <ScrubPlanPicker value={options} onChange={setOptions} />

          <p className="font-mono text-xs text-gray-500">
            snapraid scrub {scrubArgs(options).join(' ')}
          </p>
        </div>

        <div className="flex justify-end gap-3 p-6 border-t">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            {m.common_cancel()}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(scrubArgs(options))}
            disabled={!isValidScrubOptions(options)}
            className="px-4 py-2 rounded text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {m.scrub_dialog_start()}
          </button>
        </div>
      </div>
    </div>
  )
}
