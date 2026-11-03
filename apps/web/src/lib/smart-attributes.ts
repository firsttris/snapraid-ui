// Translated name and explanation of the attributes in @shared/smart-attributes, by key
import * as m from '../paraglide/messages'

export const ATTRIBUTE_TEXT: Record<
  string,
  { name: () => string; description: () => string }
> = {
  read_error_rate: {
    name: m.smart_attr_read_error_rate,
    description: m.smart_attr_read_error_rate_desc,
  },
  spin_up_time: {
    name: m.smart_attr_spin_up_time,
    description: m.smart_attr_spin_up_time_desc,
  },
  start_stop_count: {
    name: m.smart_attr_start_stop_count,
    description: m.smart_attr_start_stop_count_desc,
  },
  reallocated: {
    name: m.smart_attr_reallocated,
    description: m.smart_attr_reallocated_desc,
  },
  seek_error_rate: {
    name: m.smart_attr_seek_error_rate,
    description: m.smart_attr_seek_error_rate_desc,
  },
  power_on_hours: {
    name: m.smart_attr_power_on_hours,
    description: m.smart_attr_power_on_hours_desc,
  },
  spin_retry: {
    name: m.smart_attr_spin_retry,
    description: m.smart_attr_spin_retry_desc,
  },
  power_cycles: {
    name: m.smart_attr_power_cycles,
    description: m.smart_attr_power_cycles_desc,
  },
  wear_leveling: {
    name: m.smart_attr_wear_leveling,
    description: m.smart_attr_wear_leveling_desc,
  },
  runtime_bad_block: {
    name: m.smart_attr_runtime_bad_block,
    description: m.smart_attr_runtime_bad_block_desc,
  },
  end_to_end: {
    name: m.smart_attr_end_to_end,
    description: m.smart_attr_end_to_end_desc,
  },
  reported_uncorrectable: {
    name: m.smart_attr_reported_uncorrectable,
    description: m.smart_attr_reported_uncorrectable_desc,
  },
  command_timeout: {
    name: m.smart_attr_command_timeout,
    description: m.smart_attr_command_timeout_desc,
  },
  high_fly_writes: {
    name: m.smart_attr_high_fly_writes,
    description: m.smart_attr_high_fly_writes_desc,
  },
  airflow_temperature: {
    name: m.smart_attr_airflow_temperature,
    description: m.smart_attr_airflow_temperature_desc,
  },
  g_sense: {
    name: m.smart_attr_g_sense,
    description: m.smart_attr_g_sense_desc,
  },
  power_off_retract: {
    name: m.smart_attr_power_off_retract,
    description: m.smart_attr_power_off_retract_desc,
  },
  load_cycles: {
    name: m.smart_attr_load_cycles,
    description: m.smart_attr_load_cycles_desc,
  },
  temperature: {
    name: m.smart_attr_temperature,
    description: m.smart_attr_temperature_desc,
  },
  hardware_ecc: {
    name: m.smart_attr_hardware_ecc,
    description: m.smart_attr_hardware_ecc_desc,
  },
  reallocation_events: {
    name: m.smart_attr_reallocation_events,
    description: m.smart_attr_reallocation_events_desc,
  },
  pending: {
    name: m.smart_attr_pending,
    description: m.smart_attr_pending_desc,
  },
  offline_uncorrectable: {
    name: m.smart_attr_offline_uncorrectable,
    description: m.smart_attr_offline_uncorrectable_desc,
  },
  crc: { name: m.smart_attr_crc, description: m.smart_attr_crc_desc },
  multi_zone_error: {
    name: m.smart_attr_multi_zone_error,
    description: m.smart_attr_multi_zone_error_desc,
  },
  ssd_life_left: {
    name: m.smart_attr_ssd_life_left,
    description: m.smart_attr_ssd_life_left_desc,
  },
  available_reserve: {
    name: m.smart_attr_available_reserve,
    description: m.smart_attr_available_reserve_desc,
  },
  media_wearout: {
    name: m.smart_attr_media_wearout,
    description: m.smart_attr_media_wearout_desc,
  },
  head_flying_hours: {
    name: m.smart_attr_head_flying_hours,
    description: m.smart_attr_head_flying_hours_desc,
  },
  lbas_written: {
    name: m.smart_attr_lbas_written,
    description: m.smart_attr_lbas_written_desc,
  },
  lbas_read: {
    name: m.smart_attr_lbas_read,
    description: m.smart_attr_lbas_read_desc,
  },
}
