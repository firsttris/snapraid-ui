import type { SmartDiskInfo, SmartAttribute } from "@shared/types.ts";
import { parseLogTags, toInt, unescapeTagValue } from "./structured-log.ts";

/**
 * smartctl exit status bits, as used by SnapRAID to compute the disk status
 */
const SMARTCTL_FLAG_UNSUPPORTED = 1 << 0;
const SMARTCTL_FLAG_OPEN = 1 << 1;
const SMARTCTL_FLAG_FAIL = 1 << 3;
const SMARTCTL_FLAG_PREFAIL = 1 << 4;
const SMARTCTL_FLAG_PREFAIL_LOGGED = 1 << 5;
const SMARTCTL_FLAG_ERROR_LOGGED = 1 << 6;
const SMARTCTL_FLAG_SELFERROR_LOGGED = 1 << 7;

const SMART_POWER_ON_HOURS = 9;

/**
 * Map smartctl flags to a disk status, with the same precedence as the SnapRAID text report
 */
const statusFromFlags = (flags: number | undefined): SmartDiskInfo['status'] => {
  if (flags === undefined || flags & (SMARTCTL_FLAG_UNSUPPORTED | SMARTCTL_FLAG_OPEN)) return 'UNKNOWN';
  if (flags & SMARTCTL_FLAG_FAIL) return 'FAIL';
  if (flags & SMARTCTL_FLAG_PREFAIL) return 'PREFAIL';
  if (flags & SMARTCTL_FLAG_PREFAIL_LOGGED) return 'LOGFAIL';
  if (flags & SMARTCTL_FLAG_ERROR_LOGGED) return 'LOGERR';
  if (flags & SMARTCTL_FLAG_SELFERROR_LOGGED) return 'SELFERR';
  return 'OK';
};

const formatSize = (bytes: number): string =>
  bytes >= 1e12 ? `${(bytes / 1e12).toFixed(1)} TB` : `${Math.round(bytes / 1e9)} GB`;

/**
 * Parse SnapRAID structured log output of `smart`
 * Device tags: info|smart:<device>:<disk> and attr:<device>:<disk>:<key>:<values...>
 */
export const parseSmartOutput = (output: string): SmartDiskInfo[] => {
  const disks = new Map<string, SmartDiskInfo & { flags?: number }>();

  const disk = (device: string, name: string) => {
    const key = `${device}:${name}`;
    const existing = disks.get(key) ?? { name: name || '-', device, status: 'UNKNOWN', attributes: [] };
    disks.set(key, existing);
    return existing;
  };

  parseLogTags(output).forEach(({ name, values }) => {
    if (name === 'info' || name === 'smart') {
      disk(values[0], values[1]);
      return;
    }
    if (name !== 'attr' || values.length < 4) return;

    const [device, diskName, key, ...rest] = values;
    const d = disk(device, diskName);

    switch (key) {
      case 'serial': d.serial = unescapeTagValue(rest.join(':')); break;
      case 'model': d.model = unescapeTagValue(rest.join(':')); break;
      case 'size': d.size = formatSize(toInt(rest[0])); break;
      case 'temperature': d.temperature = toInt(rest[0]); break;
      case 'flags': d.flags = toInt(rest[0]); break;
      // attr:<device>:<disk>:afr:<afr>:<prob>
      case 'afr': d.failureProbability = Math.round(parseFloat(rest[1]) * 10000) / 100; break;
      default: {
        // attr:<device>:<disk>:<id>:<raw>:<raw_hex>:<norm>:<worst>:<thresh>:<name>:<type>:<updated>:<when_failed>
        if (!/^\d+$/.test(key)) break;
        const id = toInt(key);
        const [raw, , norm, worst, thresh, attrName, type, , whenFailed] = rest;
        const attribute: SmartAttribute = {
          id,
          name: attrName,
          value: toInt(norm),
          worst: toInt(worst),
          threshold: toInt(thresh),
          raw,
          flag: [type, whenFailed && whenFailed !== 'never' ? `failed ${whenFailed}` : ''].filter(Boolean).join(', '),
        };
        d.attributes!.push(attribute);
        // lower 32 bits hold the hours, upper bits are vendor specific
        if (id === SMART_POWER_ON_HOURS && /^\d+$/.test(raw)) d.powerOnHours = Number(BigInt(raw) & 0xffffffffn);
      }
    }
  });

  return Array.from(disks.values()).map(({ flags, ...d }) => ({
    ...d,
    status: statusFromFlags(flags),
  }));
};
