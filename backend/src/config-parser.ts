import { join } from "@std/path";
import type { AppConfig, ParsedSnapRaidConfig } from "./types.ts";

export class ConfigParser {
  /**
   * Parse a SnapRAID config file and extract disk information
   */
  static async parseSnapRaidConfig(
    configPath: string
  ): Promise<ParsedSnapRaidConfig> {
    const content = await Deno.readTextFile(configPath);
    const lines = content.split("\n");

    const config: ParsedSnapRaidConfig = {
      parity: [],
      content: [],
      data: {},
    };

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip comments and empty lines
      if (trimmed.startsWith("#") || trimmed === "") continue;

      // Parse parity lines (e.g., "parity /mnt/parity1/snapraid.parity")
      if (trimmed.startsWith("parity ")) {
        const path = trimmed.substring(7).trim();
        config.parity.push(path);
      }
      
      // Parse content lines (e.g., "content /var/snapraid/snapraid.content")
      else if (trimmed.startsWith("content ")) {
        const path = trimmed.substring(8).trim();
        config.content.push(path);
      }
      
      // Parse data lines (e.g., "data d1 /mnt/disk1")
      else if (trimmed.startsWith("data ")) {
        const parts = trimmed.substring(5).trim().split(/\s+/);
        if (parts.length >= 2) {
          const diskName = parts[0];
          const diskPath = parts.slice(1).join(" ");
          config.data[diskName] = diskPath;
        }
      }
    }

    return config;
  }

  /**
   * Load the application config
   */
  static async loadAppConfig(): Promise<AppConfig> {
    const configPath = join(Deno.cwd(), "..", "config.json");
    
    try {
      const content = await Deno.readTextFile(configPath);
      return JSON.parse(content);
    } catch (error) {
      console.warn(`Failed to load config from ${configPath}, using defaults:`, error);
      
      // Return default config
      return {
        version: "1.0.0",
        snapraidConfigs: [
          {
            name: "Default",
            path: "/etc/snapraid.conf",
            enabled: true,
          },
        ],
        backend: {
          host: "localhost",
          port: 3001,
        },
        logs: {
          maxHistoryEntries: 50,
        },
      };
    }
  }

  /**
   * Save the application config
   */
  static async saveAppConfig(config: AppConfig): Promise<void> {
    const configPath = join(Deno.cwd(), "..", "config.json");
    await Deno.writeTextFile(configPath, JSON.stringify(config, null, 2));
  }
}
