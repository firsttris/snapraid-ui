# SnapRAID UI

Eine moderne Web-UI für SnapRAID mit Live-Output und Multi-Config-Support.

## Struktur

- **frontend/** - TanStack Start (React + TypeScript + Tailwind CSS)
- **backend/** - Deno (TypeScript + WebSocket)

## Entwicklung

### Backend starten
```bash
cd backend
deno task dev
```

### Frontend starten
```bash
cd frontend
npm install
npm run dev
```

## Features (Phase 1 MVP)

### Dashboard
- ✅ SnapRAID Config-Auswahl (mehrere Configs möglich)
- ✅ Übersicht Data-Disks & Parity-Disks
- ✅ Parity-Status (aktuell/veraltet)
- ✅ Anzahl neuer/geänderter/gelöschter Dateien

### Kommandos
- ✅ `snapraid status`
- ✅ `snapraid sync` mit Fortschrittsanzeige
- ✅ `snapraid scrub`
- ✅ `snapraid diff`
- ✅ Abbrechen von Kommandos

### Output/Logs
- ✅ Live-Output während Ausführung
- ✅ Auto-Scroll
- ✅ Log-Historie
