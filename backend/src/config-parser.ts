import { join } from "@std/path";
import type { AppConfig, ParsedSnapRaidConfig } from "@shared/types.ts";

/**
 * Parse a SnapRAID config file and extract disk information
 */
export const parseSnapRaidConfig = async (
  configPath: string
): Promise<ParsedSnapRaidConfig> => {
  const content = await Deno.readTextFile(configPath);
  const lines = content.split("\n");

  return lines
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("#"))
    .reduce<ParsedSnapRaidConfig>((config, line) => {
      if (line.startsWith("parity ")) {
        return {
          ...config,
          parity: [...config.parity, line.substring(7).trim()],
        };
      }
      
      if (line.startsWith("content ")) {
        return {
          ...config,
          content: [...config.content, line.substring(8).trim()],
        };
      }
      
      if (line.startsWith("data ")) {
        const parts = line.substring(5).trim().split(/\s+/);
        if (parts.length >= 2) {
          const diskName = parts[0];
          const diskPath = parts.slice(1).join(" ");
          return {
            ...config,
            data: { ...config.data, [diskName]: diskPath },
          };
        }
      }
      
      if (line.startsWith("exclude ")) {
        return {
          ...config,
          exclude: [...config.exclude, line.substring(8).trim()],
        };
      }
      
      if (line.startsWith("pool ")) {
        return {
          ...config,
          pool: line.substring(5).trim(),
        };
      }
      
      return config;
    }, {
      parity: [],
      content: [],
      data: {},
      exclude: [],
    });
};

/**
 * Load the application config
 */
export const loadAppConfig = async (): Promise<AppConfig> => {
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
        directory: "~/.snapraid-ui/logs",
        maxFiles: 100,
        maxAge: 30,
      },
    };
  }
};

/**
 * Save the application config
 */
export const saveAppConfig = async (config: AppConfig): Promise<void> => {
  const configPath = join(Deno.cwd(), "..", "config.json");
  await Deno.writeTextFile(configPath, JSON.stringify(config, null, 2));
};
