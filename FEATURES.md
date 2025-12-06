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
- [x] `snapraid status` ausführen
- [x] `snapraid sync` mit Fortschrittsanzeige
- [x] `snapraid scrub` ausführen
- [x] `snapraid diff` anzeigen
- [x] `snapraid pool` ausführen
- [x] `snapraid smart` - SMART-Report aller Disks
- [x] `snapraid probe` - Power-Status der Disks
- [x] `snapraid up` - Disks hochfahren
- [x] `snapraid down` - Disks herunterfahren
- [x] Kommandos können abgebrochen werden

### 3. Output/Log-Anzeige
- [ ] Live-Output während Kommando-Ausführung
- [ ] Auto-Scroll beim Live-Output
- [ ] Log-Historie der letzten Ausführungen

---

## Phase 2: Erweiterte Features

### 4. SMART & Disk Management ✅ FERTIG
- [x] SMART-Report aller Disks mit Ausfallwahrscheinlichkeit
- [x] Temperatur-Monitoring mit farbcodierter Warnung
- [x] Power-Status der Disks (Standby/Active) anzeigen
- [x] Disks hochfahren (Spin Up)
- [x] Disks herunterfahren (Spin Down)
- [x] Kritische Disk-Warnungen
- [x] SMART-Attribute detailliert anzeigen
- [x] Individuelle oder alle Disks steuern

### 5. Pooling ✅ FERTIG
- [x] Pool-Verzeichnis konfigurieren
- [x] `snapraid pool` Befehl ausführen
- [x] Symbolische Links für virtuelle Ansicht erstellen

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


