import type { AppConfig, ParsedSnapRaidConfig, SnapRaidCommand, CommandOutput } from './types';

const API_BASE = 'http://localhost:3001';
const WS_URL = 'ws://localhost:3001/ws';

export class ApiClient {
  private ws: WebSocket | null = null;
  private wsHandlers = new Map<string, (data: any) => void>();

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
