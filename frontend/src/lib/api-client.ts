import { AppConfig, CommandOutput, ParsedSnapRaidConfig, SnapRaidCommand, RunningJob } from "@/types";


const API_BASE = 'http://localhost:3001';
const WS_URL = 'ws://localhost:3001/ws';

export class ApiClient {
  private ws: WebSocket | null = null;

  /**
   * Get app configuration
   */
  async getConfig(): Promise<AppConfig> {
    const response = await fetch(`${API_BASE}/api/config`);
    if (!response.ok) throw new Error('Failed to fetch config');
    return response.json();
  }

  /**
   * Save app configuration
   */
  async saveConfig(config: AppConfig): Promise<void> {
    const response = await fetch(`${API_BASE}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!response.ok) throw new Error('Failed to save config');
  }

  /**
   * Parse a SnapRAID config file
   */
  async parseSnapRaidConfig(path: string): Promise<ParsedSnapRaidConfig> {
    const response = await fetch(`${API_BASE}/api/snapraid/parse?path=${encodeURIComponent(path)}`);
    if (!response.ok) throw new Error('Failed to parse config');
    return response.json();
  }

  /**
   * Execute a SnapRAID command
   */
  async executeCommand(command: SnapRaidCommand, configPath: string, args: string[] = []): Promise<void> {
    const response = await fetch(`${API_BASE}/api/snapraid/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, configPath, args }),
    });
    if (!response.ok) throw new Error('Failed to execute command');
  }

  /**
   * Get command history
   */
  async getHistory(): Promise<CommandOutput[]> {
    const response = await fetch(`${API_BASE}/api/history`);
    if (!response.ok) throw new Error('Failed to fetch history');
    return response.json();
  }

  /**
   * Get current running job
   */
  async getCurrentJob(): Promise<RunningJob | null> {
    const response = await fetch(`${API_BASE}/api/snapraid/current-job`);
    if (!response.ok) throw new Error('Failed to fetch current job');
    return response.json();
  }

  /**
   * Add a new SnapRAID config
   */
  async addConfig(name: string, path: string, enabled: boolean = true): Promise<AppConfig> {
    const response = await fetch(`${API_BASE}/api/config/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, path, enabled }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to add config');
    }
    const result = await response.json();
    return result.config;
  }

  /**
   * Remove a SnapRAID config
   */
  async removeConfig(path: string): Promise<AppConfig> {
    const response = await fetch(`${API_BASE}/api/config/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    if (!response.ok) throw new Error('Failed to remove config');
    const result = await response.json();
    return result.config;
  }

  /**
   * Browse filesystem for .conf files
   */
  async browseFilesystem(path?: string, filter: 'conf' | 'directories' = 'conf'): Promise<{ path: string; entries: Array<{ name: string; isDirectory: boolean; path: string }> }> {
    let url = `${API_BASE}/api/filesystem/browse?filter=${filter}`;
    if (path) {
      url += `&path=${encodeURIComponent(path)}`;
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to browse filesystem');
    return response.json();
  }

  /**
   * Read file content
   */
  async readFile(path: string): Promise<string> {
    const response = await fetch(`${API_BASE}/api/filesystem/read?path=${encodeURIComponent(path)}`);
    if (!response.ok) throw new Error('Failed to read file');
    const result = await response.json();
    return result.content;
  }

  /**
   * Write file content
   */
  async writeFile(path: string, content: string): Promise<void> {
    const response = await fetch(`${API_BASE}/api/filesystem/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    });
    if (!response.ok) throw new Error('Failed to write file');
  }

  /**
   * Validate SnapRAID config
   */
  async validateConfig(configPath: string): Promise<{ valid: boolean; exitCode: number; output: string }> {
    const response = await fetch(`${API_BASE}/api/snapraid/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configPath }),
    });
    if (!response.ok) throw new Error('Failed to validate config');
    return response.json();
  }

  /**
   * Add a data disk to SnapRAID config
   */
  async addDataDisk(configPath: string, diskName: string, diskPath: string): Promise<ParsedSnapRaidConfig> {
    const response = await fetch(`${API_BASE}/api/snapraid/add-data-disk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configPath, diskName, diskPath }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to add data disk');
    }
    const result = await response.json();
    return result.config;
  }

  /**
   * Add a parity disk to SnapRAID config
   */
  async addParityDisk(configPath: string, parityPath: string): Promise<ParsedSnapRaidConfig> {
    const response = await fetch(`${API_BASE}/api/snapraid/add-parity-disk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configPath, parityPath }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to add parity disk');
    }
    const result = await response.json();
    return result.config;
  }

  /**
   * Remove a disk from SnapRAID config
   */
  async removeDisk(configPath: string, diskName: string | null, diskType: 'data' | 'parity'): Promise<ParsedSnapRaidConfig> {
    const response = await fetch(`${API_BASE}/api/snapraid/remove-disk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configPath, diskName, diskType }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to remove disk');
    }
    const result = await response.json();
    return result.config;
  }

  /**
   * Add an exclude pattern to SnapRAID config
   */
  async addExclude(configPath: string, pattern: string): Promise<ParsedSnapRaidConfig> {
    const response = await fetch(`${API_BASE}/api/snapraid/add-exclude`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configPath, pattern }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to add exclude pattern');
    }
    const result = await response.json();
    return result.config;
  }

  /**
   * Remove an exclude pattern from SnapRAID config
   */
  async removeExclude(configPath: string, pattern: string): Promise<ParsedSnapRaidConfig> {
    const response = await fetch(`${API_BASE}/api/snapraid/remove-exclude`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configPath, pattern }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to remove exclude pattern');
    }
    const result = await response.json();
    return result.config;
  }

  /**
   * Connect to WebSocket for live updates
   */
  connectWebSocket(handlers: {
    onOutput?: (chunk: string, command: string) => void;
    onComplete?: (command: string, exitCode: number) => void;
    onError?: (error: string, command: string) => void;
    onStatus?: (status: any) => void;
  }): void {
    if (this.ws) {
      this.ws.close();
    }

    this.ws = new WebSocket(WS_URL);

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      switch (message.type) {
        case 'output':
          handlers.onOutput?.(message.chunk, message.command);
          break;
        case 'complete':
          handlers.onComplete?.(message.command, message.exitCode);
          break;
        case 'error':
          handlers.onError?.(message.error, message.command);
          break;
        case 'status':
          handlers.onStatus?.(message.status);
          break;
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      // Reconnect after 3 seconds
      setTimeout(() => this.connectWebSocket(handlers), 3000);
    };
  }

  /**
   * Disconnect WebSocket
   */
  disconnectWebSocket(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export const apiClient = new ApiClient();
