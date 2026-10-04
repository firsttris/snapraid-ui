import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import * as m from '../paraglide/messages'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'

interface UndeleteAdvancedOptionsProps {
  diskFilter?: string
  onDiskFilterChange: (filter: string | undefined) => void
}

export const UndeleteAdvancedOptions = ({
  diskFilter,
  onDiskFilterChange,
}: UndeleteAdvancedOptionsProps) => {
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false)

  return (
    <div className="border-t pt-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowAdvanced(!showAdvanced)}
        aria-expanded={showAdvanced}
        className="-ml-2 text-muted-foreground"
      >
        <ChevronRight
          className={cn('transition-transform', showAdvanced && 'rotate-90')}
        />
        {m.undelete_advanced_options()}
      </Button>

      {showAdvanced && (
        <div className="mt-3 grid gap-2 rounded-lg border bg-muted/50 p-4">
          <Label htmlFor="undelete-disk-filter">
            {m.undelete_disk_filter_label()}
          </Label>
          <Input
            id="undelete-disk-filter"
            type="text"
            value={diskFilter ?? ''}
            onChange={(e) => onDiskFilterChange(e.target.value)}
            placeholder={m.undelete_disk_filter_placeholder()}
            className="bg-background font-mono"
          />
          <p className="text-sm text-muted-foreground">
            {m.undelete_disk_filter_help()}
          </p>
        </div>
      )}
    </div>
  )
}
