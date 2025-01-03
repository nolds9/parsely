import { Command } from "commander";
import ora from "ora";
import { Config } from "../types/config.js";
import { NotionRecipeManager } from "../managers/notion.js";
import { reviewRecipe } from "../utils/prompts.js";
import { ConfigManager } from "../managers/config.js";
import { RecipeSchemaProcessor } from "../utils/schema.js";
import fs from "fs/promises";
import inquirer from "inquirer";

export interface ChopOptions {
  url?: string;
  urls?: string[];
  input?: string;
  format?: "notion" | "json";
  validateOnly?: boolean;
  batchSize?: number;
  tags?: string[];
}

export async function executeChop(
  options: ChopOptions,
  config: Config,
  notionManager: NotionRecipeManager
): Promise<void> {
  const spinner = ora("Processing recipes").start();
  const schemaProcessor = new RecipeSchemaProcessor();
  const results = {
    successful: [] as Array<{ url: string; recipeId: string }>,
    failed: [] as Array<{ url: string; error: string }>,
    skipped: [] as Array<{ url: string; reason: string }>,
  };

  try {
    // Determine URLs to process
    let urls: string[] = [];
    if (options.input) {
      const content = await fs.readFile(options.input, "utf-8");
      urls = content
        .split("\n")
        .filter(Boolean)
        .map((url) => url.trim());
    } else if (options.urls) {
      urls = options.urls;
    } else if (options.url) {
      urls = [options.url];
    } else {
      throw new Error("No URLs provided");
    }

    // Process URLs in batches
    const batchSize = options.batchSize || 5;
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      spinner.text = `Processing batch ${
        Math.floor(i / batchSize) + 1
      }/${Math.ceil(urls.length / batchSize)}`;

      await Promise.all(
        batch.map(async (url) => {
          try {
            // Check if recipe already exists
            const existingId = await notionManager.findRecipeByUrl(url);
            if (existingId) {
              const { update } = await inquirer.prompt([
                {
                  type: "confirm",
                  name: "update",
                  message: `Recipe from ${url} already exists. Update it?`,
                  default: false,
                },
              ]);

              if (!update) {
                results.skipped.push({
                  url,
                  reason: "Recipe already exists",
                });
                return;
              }
            }

            // Fetch and process recipe
            const response = await fetch(url);
            if (!response.ok) {
              throw new Error(`Failed to fetch URL: ${response.statusText}`);
            }
            const html = await response.text();
            const schemas = schemaProcessor.extractFromHtml(html);

            if (options.validateOnly) {
              results.successful.push({ url, recipeId: "validated" });
              return;
            }

            // Transform recipe
            const recipe = schemaProcessor.transform(schemas[0]);

            // Allow user review for single recipes
            const finalRecipe =
              urls.length === 1 ? await reviewRecipe(recipe) : recipe;

            if (!finalRecipe) {
              results.skipped.push({
                url,
                reason: "User cancelled",
              });
              return;
            }

            // Save to Notion
            if (existingId) {
              await notionManager.updateRecipe(existingId, finalRecipe);
              results.successful.push({ url, recipeId: existingId });
            } else {
              const pageId = await notionManager.createRecipe(finalRecipe);
              results.successful.push({ url, recipeId: pageId });
            }
          } catch (error) {
            results.failed.push({
              url,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        })
      );

      // Add delay between batches if more to process
      if (i + batchSize < urls.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    spinner.succeed("Processing complete");

    // Print results
    console.log("\nResults:");
    console.log(`✅ Successful: ${results.successful.length}`);
    console.log(`❌ Failed: ${results.failed.length}`);
    console.log(`⏭️  Skipped: ${results.skipped.length}`);

    if (results.failed.length > 0) {
      console.log("\nFailed URLs:");
      results.failed.forEach(({ url, error }) => {
        console.log(`${url}: ${error}`);
      });
    }
  } catch (error) {
    spinner.fail("Processing failed");
    throw error;
  }
}

export function registerChopCommand(program: Command): void {
  program
    .command("chop [url]")
    .description("Import recipe(s) from webpage(s)")
    .option("-i, --input <file>", "File containing URLs to process")
    .option("-f, --format <format>", "Output format (notion/json)", "notion")
    .option("-v, --validate-only", "Only validate schema without importing")
    .option("-b, --batch-size <size>", "Number of URLs to process at once", "5")
    .option("-t, --tags <tags...>", "Tags to apply to the recipe(s)")
    .action(async (url, options) => {
      try {
        const config = await ConfigManager.load();
        const notionManager = new NotionRecipeManager(config.notion);
        await executeChop(
          {
            url,
            input: options.input,
            format: options.format,
            validateOnly: options.validateOnly,
            batchSize: parseInt(options.batchSize),
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
