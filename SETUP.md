# SnapRAID UI - Setup Guide

## Prerequisites

1. **SnapRAID** must be installed on your system
2. **Deno** - [Install from deno.com](https://deno.com/)
3. **Node.js** (v18+) and npm

## Setup

### 1. Configuration

Copy the example config and adjust it to your needs:
```bash
cp config.example.json config.json
```

Edit `config.json` and set your SnapRAID config paths:
```json
{
  "snapraidConfigs": [
    {
      "name": "Media",
      "path": "/etc/snapraid.conf",
      "enabled": true
    },
    {
      "name": "Games",
      "path": "/home/user/snapraid-games.conf",
      "enabled": true
    }
  ]
}
```

### 2. Backend Setup

```bash
cd backend
deno task dev
```

The backend will start on `http://localhost:3001` by default.

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend will be available at `http://localhost:3000`.

## Usage

1. Open `http://localhost:3000` in your browser
2. Select a SnapRAID config from the dropdown
3. View your disk configuration and current status
4. Run commands like `status`, `sync`, `scrub`, or `diff`
5. Watch the live output in the terminal-style display

## Features

✅ **Multi-Config Support** - Manage multiple SnapRAID configurations  
✅ **Live Output** - Real-time command output via WebSocket  
✅ **Auto-Scroll** - Output automatically scrolls as new data arrives  
✅ **Dashboard** - Overview of data/parity disks and sync status  
✅ **Command Execution** - Run status, sync, scrub, and diff commands  
✅ **Command History** - Review previous command outputs (stored in memory)

## API Endpoints

- `GET /api/config` - Get application config
- `POST /api/config` - Save application config
- `GET /api/snapraid/parse?path=...` - Parse a SnapRAID config file
- `POST /api/snapraid/execute` - Execute a SnapRAID command
- `GET /api/history` - Get command history
- `WS /ws` - WebSocket for live command output

## Tech Stack

**Frontend:**
- TanStack Start (React + file-based routing)
- TypeScript
- Tailwind CSS 4
- WebSocket client

**Backend:**
- Deno 2.x
- TypeScript
- Native WebSocket
- No external dependencies (uses Deno std lib)

## Development Tips

- Backend auto-reloads when files change (`--watch` flag)
- Frontend has hot module replacement (HMR)
- Check browser console for WebSocket connection status
- Backend logs all SnapRAID command executions

## Troubleshooting

**Backend won't start:**
- Make sure no other service is using port 3001
- Check that Deno is installed: `deno --version`

**Frontend can't connect:**
- Verify backend is running on port 3001
- Check browser console for CORS or WebSocket errors

**SnapRAID commands fail:**
- Ensure SnapRAID is installed: `snapraid --version`
- Verify config file paths in `config.json` are correct
- Check that you have permissions to read the config files

**No disks showing:**
- Click "Status" to load initial data
- Verify your SnapRAID config file is properly formatted
