import { useQuery } from '@tanstack/react-query'
import { HardDrive } from 'lucide-react'
import { setupApi } from '../lib/api/setup'
import { formatGB } from '../lib/utils'
import * as m from '../paraglide/messages'
import { Badge } from './ui/badge'

interface MountSuggestionsProps {
  // Paths of the array's disks and files; a mount holding one of them is taken
  used: string[]
  // Parity wants an empty disk, data disks bring their files along
  warnNotEmpty?: boolean
  onPick: (path: string) => void
}

const trimSlash = (path: string) =>
  path.length > 1 ? path.replace(/\/+$/, '') : path

/**
 * The mounted disks not in the array yet, as in the setup wizard: one click instead of typing the path
 */
export const MountSuggestions = ({
  used,
  warnNotEmpty = false,
  onPick,
}: MountSuggestionsProps) => {
  const { data: mounts } = useQuery({
    queryKey: ['setup-mounts'],
    queryFn: setupApi.mounts,
    staleTime: 60_000,
  })
  const taken = used.map(trimSlash)
  const free = (mounts ?? []).filter(
    (mount) =>
      !taken.some(
        (path) => path === mount.path || path.startsWith(`${mount.path}/`),
      ),
  )
  if (free.length === 0) return null

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{m.mount_suggestions_title()}</span>
      <div className="flex flex-wrap gap-2">
        {free.map((mount) => (
          <button
            key={mount.path}
            type="button"
            onClick={() => onPick(mount.path)}
            className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none dark:bg-input/20"
          >
            <HardDrive className="size-4 shrink-0 text-muted-foreground" />
            <span className="font-mono">{mount.path}</span>
            <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
              {m.mount_suggestions_size({
                size: formatGB(mount.totalBytes / 1e9),
                free: formatGB(mount.freeBytes / 1e9),
              })}
            </span>
            {warnNotEmpty && !mount.empty && (
              <Badge variant="warning">{m.mount_suggestions_not_empty()}</Badge>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
