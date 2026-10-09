import { ChevronRight, Loader2, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import {
  useAddDataDisk,
  useAddExclude,
  useAddParityDisk,
  useRemoveExclude,
  useRemoveParityDisk,
  useSetPool,
  useSnapRaidConfig,
} from '../hooks/queries'
import * as m from '../paraglide/messages'
import { ContentFileSection } from './ContentFileSection'
import { DataDiskSection } from './DataDiskSection'
import { ErrorAlert } from './ErrorAlert'
import { ExcludePatternSection } from './ExcludePatternSection'
import { OptionsSection } from './OptionsSection'
import { ParityDiskSection } from './ParityDiskSection'
import { PoolSection } from './PoolSection'
import { Badge } from './ui/badge'

interface DiskManagerProps {
  configPath: string
  onUpdate?: () => void
}

export const DiskManager = ({ configPath, onUpdate }: DiskManagerProps) => {
  const [error, setError] = useState<string>('')

  // TanStack Query hooks
  const { data: config, isLoading: loading } = useSnapRaidConfig(configPath)
  const addDataDiskMutation = useAddDataDisk()
  const removeParityDiskMutation = useRemoveParityDisk()
  const addParityDiskMutation = useAddParityDisk()
  const addExcludeMutation = useAddExclude()
  const removeExcludeMutation = useRemoveExclude()
  const setPoolMutation = useSetPool()

  // Handler functions for child components
  const handleAddDataDisk = async (name: string, path: string) => {
    setError('')
    addDataDiskMutation.mutate(
      { configPath, diskName: name, diskPath: path },
      {
        onSuccess: () => onUpdate?.(),
        onError: (err) => {
          setError(String(err))
          throw err
        },
      },
    )
  }

  const handleAddParity = async (fullPath: string) => {
    setError('')
    addParityDiskMutation.mutate(
      { configPath, parityPath: fullPath },
      {
        onSuccess: () => onUpdate?.(),
        onError: (err) => {
          setError(String(err))
          throw err
        },
      },
    )
  }

  const handleRemoveParity = async (level: number) => {
    setError('')
    removeParityDiskMutation.mutate(
      { configPath, level },
      {
        onSuccess: () => onUpdate?.(),
        onError: (err) => {
          setError(String(err))
          throw err
        },
      },
    )
  }

  const handleAddExclude = async (pattern: string) => {
    setError('')
    addExcludeMutation.mutate(
      { configPath, pattern },
      {
        onSuccess: () => onUpdate?.(),
        onError: (err) => {
          setError(String(err))
          throw err
        },
      },
    )
  }
  const handleRemoveExclude = async (pattern: string) => {
    setError('')
    removeExcludeMutation.mutate(
      { configPath, pattern },
      {
        onSuccess: () => onUpdate?.(),
        onError: (err) => {
          setError(String(err))
          throw err
        },
      },
    )
  }

  const handleSetPool = async (poolPath: string | undefined) => {
    setError('')
    setPoolMutation.mutate(
      { configPath, poolPath },
      {
        onSuccess: () => onUpdate?.(),
        onError: (err) => {
          setError(String(err))
          throw err
        },
      },
    )
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {m.disk_manager_loading()}
      </div>
    )
  }

  if (!config) {
    return <ErrorAlert error={m.disk_manager_load_failed()} />
  }

  // A mount holding one of these is no candidate for a new disk
  const usedPaths = [
    ...Object.values(config.data),
    ...config.parity.flatMap((level) => level.paths),
    ...config.content,
  ]

  // Too few content files is a real problem, then the advanced settings start open
  const contentMissing = config.content.length < config.parity.length + 1

  return (
    <div className="flex flex-col gap-4">
      {error && <ErrorAlert error={error} />}

      <DataDiskSection
        configPath={configPath}
        data={config.data}
        pendingRemoval={config.pendingRemoval}
        usedPaths={usedPaths}
        onAdd={handleAddDataDisk}
      />

      <ParityDiskSection
        configPath={configPath}
        parity={config.parity}
        usedPaths={usedPaths}
        onAdd={handleAddParity}
        onRemove={handleRemoveParity}
      />

      {/* What most arrays set once and leave alone */}
      <details
        className="group flex flex-col rounded-xl border bg-card shadow-sm"
        open={contentMissing || undefined}
      >
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
          <span className="text-base font-semibold">
            {m.config_advanced_title()}
          </span>
          <span className="text-sm text-muted-foreground">
            {m.config_advanced_summary({
              content: config.content.length,
              exclude: config.exclude.length,
            })}
          </span>
          {contentMissing && (
            <Badge variant="warning">
              <TriangleAlert />
              {m.config_advanced_content_missing()}
            </Badge>
          )}
        </summary>
        <div className="flex flex-col gap-4 border-t p-4">
          <ContentFileSection
            configPath={configPath}
            content={config.content}
            onUpdate={onUpdate}
          />

          <ExcludePatternSection
            exclude={config.exclude}
            onAdd={handleAddExclude}
            onRemove={handleRemoveExclude}
          />

          <PoolSection pool={config.pool} onPoolChange={handleSetPool} />

          <OptionsSection
            configPath={configPath}
            autosave={config.autosave}
            blocksize={config.blocksize}
            onUpdate={onUpdate}
          />
        </div>
      </details>
    </div>
  )
}
