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
import { ConfigManager } from "../managers/config.js";

export interface ScanCommandOptions extends RecipeImportOptions {
  files: string[];
}

async function processWithRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  }

  throw lastError;
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

    const message = await processWithRetry(() =>
      anthropic.messages.create({
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
      })
    );

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

function validateImageFile(filename: string): void {
  const ext = path.extname(filename).toLowerCase();
  const supportedFormats = [".jpg", ".jpeg", ".png"];

  if (!supportedFormats.includes(ext)) {
    throw new Error(
      `Unsupported image format: ${ext}. Supported formats: ${supportedFormats.join(
        ", "
      )}`
    );
  }
}

interface ProcessingLog {
  filename: string;
  status: "success" | "error";
  error?: string;
  notionPageId?: string;
}

export async function executeScan(
  options: ScanCommandOptions,
  config: Config,
  notionManager: NotionRecipeManager
): Promise<void> {
  const spinner = ora("Processing photos").start();
  let processed = 0;
  const total = options.files.length;

  const processingLog: ProcessingLog[] = [];

  try {
    if (options.model === "gpt4" && !config.ai?.openaiKey) {
      throw new Error("OpenAI API key required");
    }
    if (options.model === "claude" && !config.ai?.anthropicKey) {
      throw new Error("Anthropic API key required");
    }

    if (options.single) {
      spinner.text = `Processing ${options.files.length} photos as single recipe`;

      const images = await Promise.all(
        options.files.map(async (file) => {
          validateImageFile(file);
          return {
            buffer: await fs.readFile(file),
            base64: (await fs.readFile(file)).toString("base64"),
            filename: path.basename(file),
          };
        })
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
      processingLog.push({
        filename: images.map((img) => img.filename).join(", "),
        status: "success",
        notionPageId: pageId,
      });
    } else {
      for (const file of options.files) {
        try {
          processed++;
          spinner.text = `Processing photo ${processed}/${total}: ${path.basename(
            file
          )}`;

          validateImageFile(file);
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
            processingLog.push({
              filename: path.basename(file),
              status: "error",
              error: "Skipped by user",
            });
            continue;
          }

          const pageId = await notionManager.createRecipe(finalRecipe);
          await notionManager.attachPhotoToRecipe(
            pageId,
            imageBuffer,
            path.basename(file)
          );

          spinner.succeed(`Imported ${path.basename(file)}`);
          processingLog.push({
            filename: path.basename(file),
            status: "success",
            notionPageId: pageId,
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          spinner.fail(
            `Failed to process ${path.basename(file)}: ${errorMessage}`
          );
          processingLog.push({
            filename: path.basename(file),
            status: "error",
            error: errorMessage,
          });
          // Continue processing other files
        }
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    spinner.fail(`Processing failed: ${errorMessage}`);
    throw error;
  } finally {
    if (processingLog.length > 0) {
      console.log("\nProcessing Summary:");
      processingLog.forEach((log) => {
        if (log.status === "success") {
          console.log(`✅ ${log.filename} -> ${log.notionPageId}`);
        } else {
          console.log(`❌ ${log.filename}: ${log.error}`);
        }
      });
    }
  }
}

export function registerScanCommand(program: Command): void {
  program
    .command("scan <files...>")
    .description("Import recipes from photos")
    .option("-m, --model <model>", "AI model (claude/gpt4)", "claude")
    .option("-l, --language <language>", "Source language", "english")
    .option("-s, --single", "Treat multiple photos as single recipe", false)
    .option("-r, --retries <number>", "Number of retry attempts", "3")
    .option("--debug", "Enable detailed debug logging", false)
    .option("--no-spinner", "Disable progress spinner")
    .action(async (files, options) => {
      try {
        const config = await ConfigManager.load();
        const notionManager = new NotionRecipeManager(config.notion);
        await executeScan(
          {
            ...options,
            files,
            maxRetries: parseInt(options.retries, 10),
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
