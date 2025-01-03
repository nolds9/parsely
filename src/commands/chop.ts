import { Command } from "commander";
import ora from "ora";
import { Recipe } from "../types/recipe.js";
import { Config } from "../types/config.js";
import { NotionRecipeManager } from "../managers/notion.js";
import { reviewRecipe } from "../utils/prompts.js";
import { loadConfig } from "../utils/config.js";
import { Anthropic } from "@anthropic-ai/sdk";
import inquirer from "inquirer";

export interface ChopOptions {
  url: string;
  tags?: string[];
}

async function scrapeRecipe(url: string, config: Config): Promise<Recipe> {
  const spinner = ora("Fetching recipe").start();

  try {
    // First fetch the webpage content
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.statusText}`);
    }
    const html = await response.text();

    // Use Claude to extract recipe information
    const anthropic = new Anthropic({ apiKey: config.ai.anthropicKey });

    const prompt = `Extract recipe information from this webpage HTML and format as JSON matching this type:
    {
      name: string;
      ingredients: string[];
      instructions: Array<{ text: string }>;
      cuisineType: string | null;
      prepTime: string | null;
      cookTime: string | null;
      recipeYield: string | null;
      notes: string | null;
    }
    
    HTML content:
    ${html}`;

    spinner.text = "Analyzing recipe";

    const message = await anthropic.messages.create({
      model: "claude-3-sonnet-20240229",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const jsonMatch = message.content
      .find(
        (block): block is { type: "text"; text: string } =>
          block.type === "text"
      )
      ?.text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error("Failed to extract recipe information");
    }

    const recipe = JSON.parse(jsonMatch[0]) as Recipe;
    spinner.succeed("Recipe extracted");
    return recipe;
  } catch (error) {
    spinner.fail("Failed to extract recipe");
    throw error;
  }
}

export async function executeChop(
  options: ChopOptions,
  config: Config,
  notionManager: NotionRecipeManager
): Promise<void> {
  try {
    // Check if recipe already exists
    const existingId = await notionManager.findRecipeByUrl(options.url);
    if (existingId) {
      const { update } = await inquirer.prompt([
        {
          type: "confirm",
          name: "update",
          message: "Recipe already exists. Update it?",
          default: false,
        },
      ]);

      if (!update) {
        console.log("Skipping import");
        return;
      }
    }

    // Scrape and process the recipe
    const recipe = await scrapeRecipe(options.url, config);

    // Let user review and edit
    const finalRecipe = await reviewRecipe(recipe);
    if (!finalRecipe) {
      console.log("Import cancelled");
      return;
    }

    // Save to Notion
    if (existingId) {
      await notionManager.updateRecipe(existingId, finalRecipe);
      console.log("Recipe updated successfully");
    } else {
      await notionManager.createRecipe(finalRecipe);
      console.log("Recipe imported successfully");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to import recipe: ${message}`);
  }
}

export function registerChopCommand(program: Command): void {
  program
    .command("chop <url>")
    .description("Import recipe from a webpage")
    .option("-t, --tags <tags...>", "Tags to apply to the recipe")
    .action(async (url, options) => {
      try {
        const config = await loadConfig();
        const notionManager = new NotionRecipeManager(config.notion);
        await executeChop({ url, tags: options.tags }, config, notionManager);
      } catch (error) {
        console.error(error);
        process.exit(1);
      }
    });
}
