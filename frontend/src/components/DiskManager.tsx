import { Loader2 } from 'lucide-react'
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

  return (
    <div className="flex flex-col gap-4">
      {error && <ErrorAlert error={error} />}

      <ParityDiskSection
        configPath={configPath}
        parity={config.parity}
        onAdd={handleAddParity}
        onRemove={handleRemoveParity}
      />

      <ContentFileSection
        configPath={configPath}
        content={config.content}
        onUpdate={onUpdate}
      />

      <DataDiskSection
        configPath={configPath}
        data={config.data}
        pendingRemoval={config.pendingRemoval}
        onAdd={handleAddDataDisk}
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
  )
}
