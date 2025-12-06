# SMART & Disk Management Features

This document describes the newly implemented SMART & Disk Management features.

## Features Implemented

### 1. SMART Monitor (`smart` command)
- **Backend Endpoint**: `GET /api/snapraid/smart?path=<config>`
- **Frontend Component**: `SmartMonitor.tsx`
- **Description**: Displays SMART health data for all disks in the array

#### Features:
- ✅ Disk health status (OK, FAIL, PREFAIL, LOGFAIL, LOGERR, SELFERR)
- ✅ Temperature monitoring with color-coded warnings
- ✅ Failure probability percentage (0-100%)
- ✅ Power-on hours with year calculation
- ✅ Critical disk warnings (failures > 5% or FAIL/PREFAIL status)
- ✅ Warning disk alerts (failures > 1% or error logs)
- ✅ Expandable SMART attributes table per disk
- ✅ Raw output display toggle
- ✅ Disk model, serial, and capacity information

### 2. Disk Power Management

#### Probe (`probe` command)
- **Backend Endpoint**: `GET /api/snapraid/probe?path=<config>`
- **Frontend Component**: `DiskPowerControl.tsx`
- **Description**: Shows power state of all disks (Active, Standby, Idle)

#### Spin Up (`up` command)
- **Backend Endpoint**: `POST /api/snapraid/up`
- **Body**: `{ configPath: string, disks?: string[] }`
- **Description**: Spins up selected disks or all disks

#### Spin Down (`down` command)
- **Backend Endpoint**: `POST /api/snapraid/down`
- **Body**: `{ configPath: string, disks?: string[] }`
- **Description**: Spins down selected disks or all disks to standby mode

#### Features:
- ✅ Live disk power status with visual indicators (🟢 Active, ⚫ Standby, 🟡 Idle)
- ✅ Select individual disks or all disks for operations
- ✅ Checkbox-based disk selection
- ✅ Summary of active vs. standby disks
- ✅ Power consumption warnings
- ✅ Auto-refresh after spin up/down operations

## User Interface

### Tab Navigation
The dashboard now features three tabs:
1. **📊 Dashboard** - Original SnapRAID commands and output
2. **🔍 SMART Monitor** - Disk health monitoring
3. **⚡ Disk Power** - Disk power state management

### SMART Monitor UI Elements
- Refresh button to load latest SMART data
- Last updated timestamp
- Critical/Warning disk alerts at the top
- Individual disk cards showing:
  - Disk name and device path
  - Status badge with color coding
  - Temperature gauge
  - Failure probability
  - Power-on hours
  - Model, serial, capacity
  - Expandable SMART attributes

### Disk Power Control UI Elements
- Probe button to check current power state
- Select All / Select None buttons
- Individual disk selection checkboxes
- Active/Standby disk count summary
- Large Spin Up / Spin Down buttons
- Power consumption warning message
- Raw output toggle

## Internationalization (i18n)

All UI text is fully internationalized in both English and German:

### English Messages
- `smart_monitor_*` - SMART Monitor labels
- `disk_power_*` - Disk Power Control labels
- `tab_*` - Tab navigation labels

### German Messages
- Complete German translations for all features
- Consistent with existing German UI

## API Types

### New Types in `shared/types.ts`:

```typescript
export type SnapRaidCommand = 
  'status' | 'sync' | 'scrub' | 'diff' | 'fix' | 'check' | 'pool' | 
  'smart' | 'probe' | 'up' | 'down';

export interface SmartDiskInfo {
  name: string;
  device: string;
  status: 'OK' | 'FAIL' | 'PREFAIL' | 'LOGFAIL' | 'LOGERR' | 'SELFERR' | 'UNKNOWN';
  temperature?: number;
  powerOnHours?: number;
  failureProbability?: number;
  model?: string;
  serial?: string;
  size?: string;
  attributes?: SmartAttribute[];
}

export interface SmartAttribute {
  id: number;
  name: string;
  value: number;
  worst: number;
  threshold: number;
  raw: string;
  flag: string;
}

export interface DiskPowerStatus {
  name: string;
  device: string;
  status: 'Active' | 'Standby' | 'Idle' | 'Unknown';
}

export interface SmartReport {
  disks: SmartDiskInfo[];
  timestamp: string;
  rawOutput: string;
}

export interface ProbeReport {
  disks: DiskPowerStatus[];
  timestamp: string;
  rawOutput: string;
}
```

## Backend Implementation

### Parser Functions

The backend includes custom parsers for SnapRAID output:

1. **`parseSmartOutput(output: string)`** - Parses SMART report
   - Extracts disk name, device, status
   - Parses temperature, power-on hours
   - Identifies failure probability
   - Extracts model, serial, size

2. **`parseProbeOutput(output: string)`** - Parses probe output
   - Matches disk name, device, power status
   - Handles Active, Standby, Idle states

### Error Handling

- All endpoints include proper error handling
- Non-zero exit codes return error responses
- stderr output is captured and returned

## Usage Examples

### Frontend API Calls

```typescript
import { getSmart, probe, spinUp, spinDown } from '../lib/api/snapraid'

// Get SMART data
const smartData = await getSmart('/etc/snapraid.conf')

// Check power status
const powerStatus = await probe('/etc/snapraid.conf')

// Spin up all disks
await spinUp('/etc/snapraid.conf')

// Spin up specific disks
await spinUp('/etc/snapraid.conf', ['d1', 'd2'])

// Spin down all disks
await spinDown('/etc/snapraid.conf')

// Spin down specific disks
await spinDown('/etc/snapraid.conf', ['d3'])
```

## Future Enhancements

Potential improvements for future versions:

1. **Auto-refresh** - Periodic SMART/power status updates
2. **Alerts** - Email/notification on critical disk status
3. **History** - Track SMART attribute changes over time
4. **Graphs** - Temperature and health trends
5. **Thresholds** - Configurable warning/critical thresholds
6. **Export** - Download SMART reports as CSV/JSON

## Testing

To test the features:

1. Select a SnapRAID configuration
2. Click the "SMART Monitor" tab
3. Click "Refresh SMART Data" to load disk health
4. Click the "Disk Power" tab
5. Click "Probe Disk Status" to check power states
6. Select disks and use Spin Up/Down buttons

## Notes

- **Power Supply Warning**: Spinning up all disks simultaneously requires significant power
- **Disk Wear**: Frequent spin up/down cycles may increase wear on some drives
- **smartctl Requirement**: The `smart` and `probe` commands require smartmontools to be installed
- **Permissions**: May require root/sudo permissions depending on system configuration
