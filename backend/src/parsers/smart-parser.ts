import type { SmartDiskInfo } from "@shared/types.ts";

/**
 * Parse disk status from SMART output line
 */
const parseSmartStatus = (line: string): SmartDiskInfo['status'] | null => {
  const statuses: SmartDiskInfo['status'][] = ['FAIL', 'PREFAIL', 'LOGFAIL', 'LOGERR', 'SELFERR'];
  const found = statuses.find(status => line.includes(status));
  return found || null;
};

/**
 * Parse SMART attribute from line
 */
const parseSmartAttribute = (line: string, currentDisk: Partial<SmartDiskInfo>): void => {
  const tempMatch = line.match(/Temperature.*?(\d+)\s*°?C/i);
  if (tempMatch) {
    currentDisk.temperature = parseInt(tempMatch[1]);
    return;
  }

  const hoursMatch = line.match(/Power[_\s]On[_\s]Hours.*?(\d+)/i);
  if (hoursMatch) {
    currentDisk.powerOnHours = parseInt(hoursMatch[1]);
    return;
  }

  const probMatch = line.match(/probability.*?(\d+\.?\d*)%/i);
  if (probMatch) {
    currentDisk.failureProbability = parseFloat(probMatch[1]);
    return;
  }

  const modelMatch = line.match(/Device Model:\s*(.+)/i);
  if (modelMatch) {
    currentDisk.model = modelMatch[1].trim();
    return;
  }

  const serialMatch = line.match(/Serial Number:\s*(.+)/i);
  if (serialMatch) {
    currentDisk.serial = serialMatch[1].trim();
    return;
  }

  const sizeMatch = line.match(/User Capacity:\s*(.+)/i);
  if (sizeMatch) {
    currentDisk.size = sizeMatch[1].trim();
  }
};

/**
 * Parse SMART output
 */
export const parseSmartOutput = (output: string): SmartDiskInfo[] => {
  const lines = output.split('\n');
  const disks: SmartDiskInfo[] = [];
  
  const result = lines.reduce<{ currentDisk: Partial<SmartDiskInfo> | null }>((acc, line) => {
    const trimmed = line.trim();
    
    // Empty line - save current disk
    if (trimmed === '' && acc.currentDisk !== null) {
      disks.push(acc.currentDisk as SmartDiskInfo);
      return { currentDisk: null };
    }

    // Match disk header
    const diskMatch = trimmed.match(/^(\S+)\s+(.+)$/);
    if (diskMatch && !trimmed.includes(':') && acc.currentDisk === null) {
      return {
        currentDisk: {
          name: diskMatch[1],
          device: diskMatch[2],
          status: 'UNKNOWN' as const,
        },
      };
    }

    if (acc.currentDisk) {
      // Check status
      const status = parseSmartStatus(trimmed);
      if (status) {
        acc.currentDisk.status = status;
      } else if (acc.currentDisk.status === 'UNKNOWN' && trimmed.includes('/dev/')) {
        acc.currentDisk.status = 'OK';
      }

      // Parse attributes
      parseSmartAttribute(trimmed, acc.currentDisk);
    }

    return acc;
  }, { currentDisk: null });

  // Add last disk if exists
  if (result.currentDisk !== null) {
    disks.push(result.currentDisk as SmartDiskInfo);
  }

  return disks;
};
