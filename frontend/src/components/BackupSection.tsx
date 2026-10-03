import { useQueryClient } from '@tanstack/react-query'
import { Download, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { downloadBackup, restoreBackup } from '../lib/api/config'
import * as m from '../paraglide/messages'
import { Button } from './Button'
import { errorMessage, useFeedback } from './Feedback'

/**
 * Download the settings as one file and restore them, e.g. to move to a new server
 */
export const BackupSection = () => {
  const { confirm, toast } = useFeedback()
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const download = async () => {
    setBusy(true)
    try {
      const { blob, filename } = await downloadBackup()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const restore = async (file: File) => {
    const confirmed = await confirm({
      title: m.backup_restore_title(),
      message: m.backup_restore_confirm({ file: file.name }),
      confirmLabel: m.backup_restore(),
      danger: true,
    })
    if (!confirmed) return
    setBusy(true)
    try {
      const { restored, skipped } = await restoreBackup(await file.text())
      // Configs, schedules and settings all may have changed
      await queryClient.invalidateQueries()
      toast.success(
        skipped.length > 0
          ? m.backup_restored_skipped({
              count: String(restored.length),
              skipped: skipped.join(', '),
            })
          : m.backup_restored({ count: String(restored.length) }),
      )
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-6 border-t pt-6">
      <h3 className="font-semibold text-gray-900">{m.backup_title()}</h3>
      <p className="mt-1 text-sm text-gray-600">{m.backup_description()}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={download}
        >
          <Download size={16} />
          {m.backup_download()}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
        >
          <Upload size={16} />
          {m.backup_restore()}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) restore(file)
          }}
        />
      </div>
    </div>
  )
}
