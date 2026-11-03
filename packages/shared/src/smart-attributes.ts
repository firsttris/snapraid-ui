// The SMART attributes worth explaining, by id. Names and explanations are translated by key
// (smart_attr_<key> and smart_attr_<key>_desc); the important ones lead the attribute table,
// the others wait behind "Show all".

export interface AttributeInfo {
  key: string;
  important?: boolean; // Says something about the health of the disk
  // Some vendors use the id for something else (233 is NAND writes on SanDisk, not wearout):
  // the explanation only applies when smartctl's name for it matches
  names?: RegExp;
}

export const ATTRIBUTE_INFO: Record<number, AttributeInfo> = {
  1: { key: "read_error_rate" },
  3: { key: "spin_up_time" },
  4: { key: "start_stop_count" },
  5: { key: "reallocated", important: true },
  7: { key: "seek_error_rate" },
  9: { key: "power_on_hours", important: true },
  10: { key: "spin_retry", important: true },
  12: { key: "power_cycles" },
  177: { key: "wear_leveling", important: true, names: /wear/i },
  183: { key: "runtime_bad_block", names: /bad_?block/i },
  184: { key: "end_to_end", important: true, names: /end.?to.?end/i },
  187: { key: "reported_uncorrectable", important: true },
  188: { key: "command_timeout" },
  189: { key: "high_fly_writes", names: /fly/i },
  190: { key: "airflow_temperature", names: /temp/i },
  191: { key: "g_sense", names: /g.?sense/i },
  192: { key: "power_off_retract" },
  193: { key: "load_cycles" },
  194: { key: "temperature", important: true, names: /temp/i },
  195: { key: "hardware_ecc", names: /ecc/i },
  196: { key: "reallocation_events", important: true },
  197: { key: "pending", important: true },
  198: { key: "offline_uncorrectable", important: true },
  199: { key: "crc", important: true },
  200: { key: "multi_zone_error", names: /multi.?zone/i },
  231: { key: "ssd_life_left", important: true, names: /life/i },
  232: { key: "available_reserve", important: true, names: /res(e)?rv|spare/i },
  233: { key: "media_wearout", important: true, names: /wear/i },
  240: { key: "head_flying_hours", names: /fly/i },
  241: { key: "lbas_written", names: /writ/i },
  242: { key: "lbas_read", names: /read/i },
};

/**
 * What the catalog knows about an attribute, unless the disk's vendor uses the id for something else
 */
export const attributeInfo = (attribute: { id: number; name: string }): AttributeInfo | undefined => {
  const info = ATTRIBUTE_INFO[attribute.id];
  return info && (!info.names || info.names.test(attribute.name)) ? info : undefined;
};

export interface TemperatureRaw {
  current: number;
  min?: number;
  max?: number;
}

/**
 * The raw value of a temperature attribute: the current reading in the lowest byte; many disks
 * pack the lowest and highest ever measured into bytes 2 and 4 (322123857953 = 0x4B00140021:
 * 33 °C now, 20 to 75 °C)
 */
export const temperatureRaw = (raw: string): TemperatureRaw | undefined => {
  const match = raw.trim().match(/^\d+/);
  if (!match) return undefined;
  const value = Number(match[0]);
  if (!Number.isSafeInteger(value)) return undefined;
  const byte = (index: number) => Math.floor(value / 2 ** (8 * index)) % 256;
  const current = byte(0);
  if (value < 256) return { current };
  const [min, max] = [byte(2), byte(4)];
  return min > 0 && min <= current && current <= max ? { current, min, max } : { current };
};
