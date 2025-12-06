import { useState, useEffect } from 'react'
import { apiClient } from '../lib/api-client'
import type { ParsedSnapRaidConfig } from '../types'
import { ParityDiskSection } from './ParityDiskSection'
import { DataDiskSection } from './DataDiskSection'
import { ExcludePatternSection } from './ExcludePatternSection'

interface DiskManagerProps {
  configPath: string
  onUpdate?: () => void
}

export function DiskManager({ configPath, onUpdate }: DiskManagerProps) {
  const [config, setConfig] = useState<ParsedSnapRaidConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    loadConfig()
  }, [configPath])

  async function loadConfig() {
    setLoading(true)
    setError('')
    try {
      const parsed = await apiClient.parseSnapRaidConfig(configPath)
      setConfig(parsed)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  // Handler functions for child components
  async function handleAddDataDisk(name: string, path: string) {
    setError('')
    try {
      const updated = await apiClient.addDataDisk(configPath, name, path)
      setConfig(updated)
      onUpdate?.()
    } catch (err) {
      setError(String(err))
      throw err
    }
  }

  async function handleRemoveDataDisk(diskName: string) {
    setError('')
    try {
      const updated = await apiClient.removeDisk(configPath, diskName, 'data')
      setConfig(updated)
      onUpdate?.()
    } catch (err) {
      setError(String(err))
      throw err
    }
  }

  async function handleAddParity(fullPath: string) {
    setError('')
    try {
      const updated = await apiClient.addParityDisk(configPath, fullPath)
      setConfig(updated)
      onUpdate?.()
    } catch (err) {
      setError(String(err))
      throw err
    }
  }

  async function handleRemoveParity() {
    setError('')
    try {
      const updated = await apiClient.removeDisk(configPath, null, 'parity')
      setConfig(updated)
      onUpdate?.()
    } catch (err) {
      setError(String(err))
      throw err
    }
  }

  async function handleAddExclude(pattern: string) {
    setError('')
    try {
      const updated = await apiClient.addExclude(configPath, pattern)
      setConfig(updated)
      onUpdate?.()
    } catch (err) {
      setError(String(err))
      throw err
    }
  }

  async function handleRemoveExclude(pattern: string) {
    setError('')
    try {
      const updated = await apiClient.removeExclude(configPath, pattern)
      setConfig(updated)
      onUpdate?.()
    } catch (err) {
      setError(String(err))
      throw err
    }
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
