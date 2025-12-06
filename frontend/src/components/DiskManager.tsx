import { useState } from 'react'
import { useSnapRaidConfig, useAddDataDisk, useRemoveDisk, useAddParityDisk, useAddExclude, useRemoveExclude } from '../lib/api-client'
import { ParityDiskSection } from './ParityDiskSection'
import { DataDiskSection } from './DataDiskSection'
import { ExcludePatternSection } from './ExcludePatternSection'

interface DiskManagerProps {
  configPath: string
  onUpdate?: () => void
}

export const DiskManager = ({ configPath, onUpdate }: DiskManagerProps) => {
  const [error, setError] = useState<string>('')

  // TanStack Query hooks
  const { data: config, isLoading: loading } = useSnapRaidConfig(configPath)
  const addDataDiskMutation = useAddDataDisk()
  const removeDiskMutation = useRemoveDisk()
  const addParityDiskMutation = useAddParityDisk()
  const addExcludeMutation = useAddExclude()
  const removeExcludeMutation = useRemoveExclude()

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
        }
      }
    )
  }

  const handleRemoveDataDisk = async (diskName: string) => {
    setError('')
    removeDiskMutation.mutate(
      { configPath, diskName, diskType: 'data' },
      {
        onSuccess: () => onUpdate?.(),
        onError: (err) => {
          setError(String(err))
          throw err
        }
      }
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
        }
      }
    )
  }

  const handleRemoveParity = async () => {
    setError('')
    removeDiskMutation.mutate(
      { configPath, diskName: null, diskType: 'parity' },
      {
        onSuccess: () => onUpdate?.(),
        onError: (err) => {
          setError(String(err))
          throw err
        }
      }
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
        }
      }
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
        }
      }
    )
  }

  if (loading) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg">
        <div className="text-gray-600">Loading disk configuration...</div>
      </div>
    )
  }

  if (!config) {
    return (
      <div className="p-4 bg-red-50 rounded-lg border border-red-200">
        <div className="text-red-600">Failed to load disk configuration</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      <ParityDiskSection
        parity={config.parity}
        onAdd={handleAddParity}
        onRemove={handleRemoveParity}
      />

      <DataDiskSection
        data={config.data}
        onAdd={handleAddDataDisk}
        onRemove={handleRemoveDataDisk}
      />

      <ExcludePatternSection
        exclude={config.exclude}
        onAdd={handleAddExclude}
        onRemove={handleRemoveExclude}
      />
    </div>
  )
}
