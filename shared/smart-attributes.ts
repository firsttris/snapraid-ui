// The SMART attributes worth explaining, by id. Names and explanations are translated by key
// (smart_attr_<key> and smart_attr_<key>_desc); the important ones lead the attribute table,
// the others wait behind "Show all".

export interface AttributeInfo {
  key: string;
  important?: boolean; // Says something about the health of the disk
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
  177: { key: "wear_leveling", important: true },
  183: { key: "runtime_bad_block" },
  184: { key: "end_to_end", important: true },
  187: { key: "reported_uncorrectable", important: true },
  188: { key: "command_timeout" },
  189: { key: "high_fly_writes" },
  190: { key: "airflow_temperature" },
  191: { key: "g_sense" },
  192: { key: "power_off_retract" },
  193: { key: "load_cycles" },
  194: { key: "temperature", important: true },
  195: { key: "hardware_ecc" },
  196: { key: "reallocation_events", important: true },
  197: { key: "pending", important: true },
  198: { key: "offline_uncorrectable", important: true },
  199: { key: "crc", important: true },
  200: { key: "multi_zone_error" },
  231: { key: "ssd_life_left", important: true },
  232: { key: "available_reserve", important: true },
  233: { key: "media_wearout", important: true },
  240: { key: "head_flying_hours" },
  241: { key: "lbas_written" },
  242: { key: "lbas_read" },
};
