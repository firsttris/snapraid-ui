import { join } from "@std/path";
import type { AppConfig, ParityLevel, ParsedSnapRaidConfig } from "@shared/types.ts";
import { resolveFromBase } from "./config.ts";

export const MAX_PARITY_LEVEL = 6;

const PARITY_LINE = /^(parity|[2-6]-parity|z-parity)\s+(.+)$/;

/**
 * Parse a `parity`, `N-parity` or `z-parity` line; split parity lists its files comma separated
 */
export const parseParityLine = (line: string): ParityLevel | null => {
  const match = line.trim().match(PARITY_LINE);
  if (!match) return null;

  const [, keyword, value] = match;
  const level = keyword === "parity" ? 1 : keyword === "z-parity" ? 3 : Number(keyword[0]);
  const paths = value.split(",").map(path => path.trim()).filter(Boolean);
  return { level, keyword, paths };
};

/**
 * Config keyword for a parity level
 */
export const parityKeyword = (level: number): string =>
  level === 1 ? "parity" : `${level}-parity`;

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
      const parity = parseParityLine(line);
      if (parity) {
        return {
          ...config,
          parity: [...config.parity, parity].sort((a, b) => a.level - b.level),
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
  const configPath = resolveFromBase("config.json");
  
  try {
    const content = await Deno.readTextFile(configPath);
    return JSON.parse(content);
  } catch (error) {
    console.warn(`Failed to load config from ${configPath}, using defaults:`, error);
    
    // Return default config
    const defaultConfig: AppConfig = {
      version: "1.0.0",
      snapraidConfigs: [
        {
          name: "Default",
          path: "snapraid.conf",
          enabled: true,
        },
      ],
      logs: {
        maxHistoryEntries: 50,
        directory: "logs",
        maxFiles: 100,
        maxAge: 30,
      },
    };

    // Save the default config
    try {
      await saveAppConfig(defaultConfig);
      console.log(`Created default config at ${configPath}`);
    } catch (saveError) {
      console.error(`Failed to save default config:`, saveError);
    }

    return defaultConfig;
  }
};

/**
 * Save the application config
 */
export const saveAppConfig = async (config: AppConfig): Promise<void> => {
  const configPath = resolveFromBase("config.json");
  await Deno.writeTextFile(configPath, JSON.stringify(config, null, 2));
};
