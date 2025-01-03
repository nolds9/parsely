import * as fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { Config, ConfigSchema } from "../types/config.js";

const CONFIG_FILE_NAME = "config.json";

async function findConfigFile(): Promise<string> {
  // First check the current directory
  try {
    const currentDir = process.cwd();
    const currentPath = path.join(currentDir, CONFIG_FILE_NAME);
    await fs.access(currentPath);
    return currentPath;
  } catch {
    // Config not found in current directory
  }

  // Then check the user's home directory
  try {
    const homePath = path.join(
      process.env.HOME || process.env.USERPROFILE || "",
      ".parsely",
      CONFIG_FILE_NAME
    );
    await fs.access(homePath);
    return homePath;
  } catch {
    // Config not found in home directory
  }

  throw new Error(
    'Configuration file not found. Please run "parsely init" to create one.'
  );
}

export async function loadConfig(): Promise<Config> {
  try {
    const configPath = await findConfigFile();
    const configData = await fs.readFile(configPath, "utf-8");
    const parsedConfig = JSON.parse(configData);

    // Validate the config against our schema
    const result = ConfigSchema.safeParse(parsedConfig);
    if (!result.success) {
      throw new Error(`Invalid configuration: ${result.error.message}`);
    }

    return result.data;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load config: ${error.message}`);
    }
    throw error;
  }
}

export async function saveConfig(config: Config): Promise<void> {
  try {
    // Validate the config before saving
    const result = ConfigSchema.safeParse(config);
    if (!result.success) {
      throw new Error(`Invalid configuration: ${result.error.message}`);
    }

    // Determine save location - prefer home directory
    const homePath = process.env.HOME || process.env.USERPROFILE;
    if (!homePath) {
      throw new Error("Could not determine home directory");
    }

    const configDir = path.join(homePath, ".parsely");
    const configPath = path.join(configDir, CONFIG_FILE_NAME);

    // Ensure the config directory exists
    await fs.mkdir(configDir, { recursive: true });

    // Save the config
    await fs.writeFile(
      configPath,
      JSON.stringify(result.data, null, 2),
      "utf-8"
    );
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to save config: ${error.message}`);
    }
    throw error;
  }
}

export function validateConfig(config: unknown): config is Config {
  const result = ConfigSchema.safeParse(config);
  return result.success;
}
