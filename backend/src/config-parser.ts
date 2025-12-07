import type { AppConfig, ParsedSnapRaidConfig } from "@shared/types.ts";
import { resolvePath } from "./utils/path.ts";

/**
 * Parse a SnapRAID config file and extract disk information
 */
export const parseSnapRaidConfig = async (
  configPath: string
): Promise<ParsedSnapRaidConfig> => {
  try {
    const content = await Deno.readTextFile(await resolvePath(configPath));
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
        pool: undefined,
      });
  } catch (error) {
    console.warn(`Config file not found at ${configPath}, returning empty config:`, error);
    // Return empty config if file not found
    return {
      parity: [],
      content: [],
      data: {},
      exclude: [],
      pool: undefined,
    };
  }
};

/**
 * Get the config file path based on environment
 */
const getConfigPath = () => {
  return resolvePath("/snapraid/config.json");
}

/**
 * Load the application config
 */
export const loadAppConfig = async (): Promise<AppConfig> => {
  const configPath = await getConfigPath();
  
  try {
    const content = await Deno.readTextFile(configPath);
    return JSON.parse(content);
  } catch (_error: unknown) {
    console.log(`Failed to load config from ${configPath}, creating default config.`);
    
    // Default config
    const defaultConfig: AppConfig = {
      version: "1.0.0",
      snapraidConfigs: [
        {
          name: "Default",
          path: "/snapraid/snapraid.conf",
          enabled: true,
        },
      ],
      backend: {
        host: "localhost",
        port: 8080,
      },
      logs: {
        maxHistoryEntries: 50,
        directory: "/snapraid/logs",
        maxFiles: 100,
        maxAge: 30,
      },
    };
    
    // Write default config to file
    try {
      await Deno.writeTextFile(configPath, JSON.stringify(defaultConfig, null, 2));
      console.log(`Created default config at ${configPath}`);
    } catch (writeError) {
      console.error(`Failed to write default config to ${configPath}:`, writeError);
    }
    
    return defaultConfig;
  }
};

/**
 * Save the application config
 */
export const saveAppConfig = async (config: AppConfig): Promise<void> => {
  const configPath = await getConfigPath();
  await Deno.writeTextFile(configPath, JSON.stringify(config, null, 2));
};
