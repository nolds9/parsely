import { Command } from "commander";
import * as fs from "fs/promises";
import path from "path";
import ora from "ora";
import { Anthropic } from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages/index.js";
import { Recipe, RecipeImportOptions } from "../types/recipe.js";
import { Config } from "../types/config.js";
import { NotionRecipeManager } from "../managers/notion.js";
import { reviewRecipe } from "../utils/prompts.js";
import { loadConfig } from "../utils/config.js";

export interface ScanCommandOptions extends RecipeImportOptions {
  files: string[];
}

async function processMultipleImages(
  images: Array<{ base64: string; filename: string }>,
  options: Pick<RecipeImportOptions, "model" | "language">,
  config: Config
): Promise<Recipe> {
  const anthropic = new Anthropic({ apiKey: config.ai.anthropicKey });
  const prompt = `Analyze ${images.length} recipe images and structure as JSON: { "name": string, "ingredients": string[], "instructions": { "text": string }[], "cuisineType": string | null, "prepTime": string | null, "cookTime": string | null, "recipeYield": string | null, "notes": string | null }`;

  try {
    const textContent = { type: "text", text: prompt };
    const imageContents = images.map((img) => ({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/jpeg",
        data: img.base64,
      },
    }));

    const message = await anthropic.messages.create({
      model:
        options.model === "gpt4"
          ? "claude-3-opus-20240229"
          : "claude-3-sonnet-20240229",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [textContent, ...imageContents] as MessageParam["content"],
        },
      ],
    });

    const jsonMatch = message.content
      .find(
        (block): block is { type: "text"; text: string } =>
          block.type === "text"
      )
      ?.text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) throw new Error("Failed to extract JSON");
    return JSON.parse(jsonMatch[0]) as Recipe;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    throw new Error(`AI processing failed: ${errorMessage}`);
  }
}

export async function executeScan(
  options: ScanCommandOptions,
  config: Config,
  notionManager: NotionRecipeManager
): Promise<void> {
  const spinner = ora("Processing photos").start();

  try {
    if (options.model === "gpt4" && !config.ai?.openaiKey) {
      throw new Error("OpenAI API key required");
    }
    if (options.model === "claude" && !config.ai?.anthropicKey) {
      throw new Error("Anthropic API key required");
    }

    if (options.single) {
      const images = await Promise.all(
        options.files.map(async (file) => ({
          buffer: await fs.readFile(file),
          base64: (await fs.readFile(file)).toString("base64"),
          filename: path.basename(file),
        }))
      );

      const recipe = await processMultipleImages(images, options, config);
      const finalRecipe = await reviewRecipe(recipe);

      if (!finalRecipe) {
        spinner.info("Import cancelled");
        return;
      }

      const pageId = await notionManager.createRecipe(finalRecipe);
      for (const image of images) {
        await notionManager.attachPhotoToRecipe(
          pageId,
          image.buffer,
          image.filename
        );
      }
      spinner.succeed(`Imported recipe with ${options.files.length} photos`);
    } else {
      for (const file of options.files) {
        const imageBuffer = await fs.readFile(file);
        const recipe = await processMultipleImages(
          [
            {
              base64: imageBuffer.toString("base64"),
              filename: path.basename(file),
            },
          ],
          options,
          config
        );

        const finalRecipe = await reviewRecipe(recipe);
        if (!finalRecipe) {
          spinner.info(`Skipped ${path.basename(file)}`);
          continue;
        }

        const pageId = await notionManager.createRecipe(finalRecipe);
        await notionManager.attachPhotoToRecipe(
          pageId,
          imageBuffer,
          path.basename(file)
        );
        spinner.succeed(`Imported ${path.basename(file)}`);
      }
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    spinner.fail(`Processing failed: ${errorMessage}`);
    throw error;
  }
}

export function registerScanCommand(program: Command): void {
  program
    .command("scan <files...>")
    .description("Import recipes from photos")
    .option("-m, --model <model>", "AI model (claude/gpt4)", "claude")
    .option("-l, --language <language>", "Source language", "english")
    .option("-s, --single", "Treat multiple photos as single recipe", false)
    .action(async (files, options) => {
      try {
        // These will be initialized in the main CLI
        const config = await loadConfig();
        const notionManager = new NotionRecipeManager(config.notion);
        await executeScan({ ...options, files }, config, notionManager);
      } catch (error) {
        console.error(error);
        process.exit(1);
      }
    });
}
