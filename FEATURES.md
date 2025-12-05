# SnapRAID UI - Features

## Phase 1: MVP (Minimum Viable Product)

### 1. Dashboard/Übersicht

- [] Snapraid Config auswählen, eine oder mehrere, oder default location
(ich hab z.b. eine snapraid config für media, roms, games)
- [ ] Übersicht der konfigurierten Data-Disks
- [ ] Übersicht der Parity-Disks
- [ ] Parity-Status (aktuell/veraltet)
- [ ] Anzahl neuer/geänderter/gelöschter Dateien
- [ ] Status-Anzeige des letzten Sync

### 2. Snapraid Kommandos-Ausführung
- [ ] `snapraid status` ausführen
- [ ] `snapraid sync` mit Fortschrittsanzeige
- [ ] `snapraid scrub` ausführen
- [ ] `snapraid diff` anzeigen
- [ ] Kommandos können abgebrochen werden

### 3. Output/Log-Anzeige
- [ ] Live-Output während Kommando-Ausführung
- [ ] Auto-Scroll beim Live-Output
- [ ] Log-Historie der letzten Ausführungen

---

## Phase 2: Erweiterte Features

### 6. Automation & Scheduler
- [ ] Automatische Sync-Jobs konfigurieren
- [ ] Automatische Scrub-Jobs konfigurieren
- [ ] Cron-Integration

---

## Technischer Stack

### Frontend
- **Framework**: React + TypeScript
- **Styling**: Tailwind CSS
- **Build-Tool**: Vite
- **State Management**: React Context
- **Framework**: tanstack start mit filebased routing

### Backend
- **Runtime**: Deno
- **Language**: TypeScript
- **API**: WebSocket
- **Deployment**: Für Produktion: Docker, Local development führt man alles manuell aus

---


