import type { DiffReport } from '@shared/types'
import { CircleCheck, Loader2, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getDiff } from '../lib/api/snapraid'
import * as m from '../paraglide/messages'
import { getLocale } from '../paraglide/runtime'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import { Button } from './ui/button'
import { Checkbox } from './ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'

// How many deleted files are listed before collapsing into "… and N more"
const MAX_DELETED_SHOWN = 20

const PRE_HASH_KEY = 'snapraid:sync-pre-hash'

// Remembered per browser, storage may be unavailable (private mode, blocked site data)
const loadPreHash = () => {
  try {
    return localStorage.getItem(PRE_HASH_KEY) === 'true'
  } catch {
    return false
  }
}

const savePreHash = (value: boolean) => {
  try {
    localStorage.setItem(PRE_HASH_KEY, String(value))
  } catch {
    // Only a convenience
  }
}

interface SyncPreviewDialogProps {
  configPath: string
  // An interrupted sync already recorded the file list, so diff looks clean
  // while parity still lags behind
  hasUnsyncedParity: boolean
  onConfirm: (args: string[]) => void
  onClose: () => void
}

export const SyncPreviewDialog = ({
  configPath,
  hasUnsyncedParity,
  onConfirm,
  onClose,
}: SyncPreviewDialogProps) => {
  const [diff, setDiff] = useState<DiffReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preHash, setPreHash] = useState(loadPreHash)

  useEffect(() => {
    let cancelled = false
    getDiff(configPath)
      .then((data) => {
        if (!cancelled) setDiff(data)
      })
      .catch((err) => {
        if (!cancelled)
          setError(String(err instanceof Error ? err.message : err))
      })
    return () => {
      cancelled = true
    }
  }, [configPath])

  const isLoading = !diff && !error
  const changes = diff
    ? [
        {
          label: m.diff_report_new(),
          count: diff.newFiles,
          color: 'text-blue-700',
        },
        {
          label: m.diff_report_modified(),
          count: diff.modifiedFiles,
          color: 'text-orange-700',
        },
        {
          label: m.diff_report_moved(),
          count: diff.movedFiles,
          color: 'text-purple-700',
        },
        {
          label: m.diff_report_copied(),
          count: diff.copiedFiles,
          color: 'text-cyan-700',
        },
        {
          label: m.diff_report_restored(),
          count: diff.restoredFiles,
          color: 'text-green-700',
        },
        {
          label: m.diff_report_deleted(),
          count: diff.deletedFiles,
          color: 'text-red-700',
        },
      ].filter((change) => change.count > 0)
    : []
  const deletedFiles =
    diff?.files.filter((file) => file.status === 'removed') ?? []

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-2xl"
        onInteractOutside={(e) => e.preventDefault()}
        aria-describedby={undefined}
      >
        <DialogHeader className="border-b p-6 pr-12 pb-4">
          <DialogTitle>{m.sync_preview_title()}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
          {isLoading && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {m.sync_preview_loading()}
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertDescription>
                {m.sync_preview_error({ error })}
              </AlertDescription>
            </Alert>
          )}

          {hasUnsyncedParity && (
            <Alert variant="warning">
              <TriangleAlert />
              <AlertDescription>{m.sync_preview_unfinished()}</AlertDescription>
            </Alert>
          )}

          {diff && changes.length === 0 && !hasUnsyncedParity && (
            <Alert variant="success">
              <CircleCheck />
              <AlertDescription>{m.sync_preview_no_changes()}</AlertDescription>
            </Alert>
          )}

          {changes.length > 0 && (
            <>
              <p className="text-sm text-muted-foreground">
                {m.sync_preview_intro()}
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {changes.map((change) => (
                  <div key={change.label} className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">
                      {change.label}
                    </p>
                    <p
                      className={`mt-1 text-2xl font-semibold tabular-nums ${change.color}`}
                    >
                      {change.count.toLocaleString(getLocale())}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}

          {diff && diff.deletedFiles > 0 && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>
                {m.sync_preview_deleted_warning({ count: diff.deletedFiles })}
              </AlertTitle>
              <AlertDescription>
                <p>{m.sync_preview_deleted_hint()}</p>
                {deletedFiles.length > 0 && (
                  <ul className="mt-2 max-h-48 w-full overflow-y-auto rounded-md border bg-background p-2 font-mono text-xs text-foreground">
                    {deletedFiles.slice(0, MAX_DELETED_SHOWN).map((file) => (
                      <li
                        key={`${file.disk}:${file.name}`}
                        className="truncate"
                        title={file.name}
                      >
                        {file.disk && (
                          <span className="text-red-700">{file.disk}: </span>
                        )}
                        {file.name}
                      </li>
                    ))}
                    {deletedFiles.length > MAX_DELETED_SHOWN && (
                      <li className="text-muted-foreground italic">
                        {m.sync_preview_more({
                          count: deletedFiles.length - MAX_DELETED_SHOWN,
                        })}
                      </li>
                    )}
                  </ul>
                )}
              </AlertDescription>
            </Alert>
          )}

          <label
            htmlFor="sync-pre-hash"
            className="flex cursor-pointer items-start gap-3 rounded-lg border bg-muted/50 p-3"
          >
            <Checkbox
              id="sync-pre-hash"
              checked={preHash}
              onCheckedChange={(checked) => {
                const value = checked === true
                setPreHash(value)
                savePreHash(value)
              }}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-medium">
                {m.sync_pre_hash()}{' '}
                <code className="font-mono text-xs text-muted-foreground">
                  -h
                </code>
              </span>
              <span className="block text-xs text-muted-foreground">
                {m.sync_pre_hash_hint()}
              </span>
            </span>
          </label>
        </div>

        <DialogFooter className="border-t p-6 py-4">
          <Button variant="outline" onClick={onClose}>
            {m.sync_preview_cancel()}
          </Button>
          <Button
            onClick={() => onConfirm(preHash ? ['-h'] : [])}
            disabled={isLoading}
            variant={
              error || (diff && diff.deletedFiles > 0)
                ? 'destructive'
                : 'default'
            }
          >
            {error ? m.sync_preview_start_anyway() : m.sync_preview_start()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
