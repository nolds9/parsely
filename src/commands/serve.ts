import { Command } from "commander";
import ora from "ora";
import fs from "fs/promises";
import { Recipe } from "../types/recipe.js";
import { Config } from "../types/config.js";
import { NotionRecipeManager } from "../managers/notion.js";
import { ConfigManager } from "../managers/config.js";

export interface ServeOptions {
  recipe: string; // Path to recipe JSON file
  destination: "notion";
  tags?: string[];
}

async function loadRecipeFile(filePath: string): Promise<Recipe> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const recipe = JSON.parse(content);

    // Validate recipe structure
    if (
      !recipe.name ||
      !Array.isArray(recipe.ingredients) ||
      !Array.isArray(recipe.instructions)
    ) {
      throw new Error("Invalid recipe format");
    }

    return recipe as Recipe;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load recipe file: ${error.message}`);
    }
    throw error;
  }
}

export async function executeServe(
  options: ServeOptions,
  config: Config,
  notionManager: NotionRecipeManager
): Promise<void> {
  const spinner = ora("Loading recipe").start();

  try {
    // Load recipe from file
    const recipe = await loadRecipeFile(options.recipe);
    spinner.text = "Exporting recipe";

    switch (options.destination) {
      case "notion": {
        const pageId = await notionManager.createRecipe(recipe);
        if (options.tags && options.tags.length > 0) {
          // TODO: Add tags to the recipe in Notion
          //   await notionManager.updateRecipe(pageId, {
          //     ...recipe,
          //     tags: options.tags,
          //   });
        }
        spinner.succeed(`Recipe exported to Notion`);
        break;
      }
      default:
        throw new Error(`Unsupported destination: ${options.destination}`);
    }
  } catch (error) {
    spinner.fail("Export failed");
    throw error;
  }
}

export function registerServeCommand(program: Command): void {
  program
    .command("serve <recipe>")
    .description("Export recipe to destination")
    .option("-d, --destination <destination>", "Export destination", "notion")
    .option("-t, --tags <tags...>", "Tags to apply to the recipe")
    .action(async (recipe, options) => {
      try {
        const config = await ConfigManager.load();
        const notionManager = new NotionRecipeManager(config.notion);
        await executeServe(
          {
            recipe,
            destination: options.destination,
            tags: options.tags,
          },
          config,
          notionManager
        );
      } catch (error) {
        console.error(error);
        process.exit(1);
      }
    });
}
