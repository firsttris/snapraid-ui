import type { DeviceInfo } from '@shared/types'
import * as m from '../paraglide/messages'
import { Badge } from './ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table'

interface DeviceListProps {
  devices: DeviceInfo[]
  isLoading?: boolean
  onClose: () => void
}

export function DeviceList({ devices, isLoading, onClose }: DeviceListProps) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-4xl"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="border-b p-6 pr-12 pb-4">
          <DialogTitle>{m.devices_title()}</DialogTitle>
          <DialogDescription>{m.devices_description()}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {m.common_loading()}
            </p>
          ) : devices.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {m.devices_no_devices()}
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{m.devices_disk_name()}</TableHead>
                    <TableHead>{m.devices_device()}</TableHead>
                    <TableHead>{m.devices_partition()}</TableHead>
                    <TableHead>{m.devices_major_minor()}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {devices.map((device) => (
                    <TableRow key={`${device.diskName}:${device.partition}`}>
                      <TableCell>
                        <Badge
                          variant={
                            device.diskName.includes('parity')
                              ? 'parity'
                              : 'info'
                          }
                        >
                          {device.diskName}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono">
                        {device.device}
                      </TableCell>
                      <TableCell className="font-mono">
                        {device.partition}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground tabular-nums">
                        {device.majorMinor} → {device.partMajorMinor}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
