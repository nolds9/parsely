#!/usr/bin/env node
import { Command } from "commander";
import { z } from "zod";
import * as fs from "fs/promises";
import { NotionRecipeManager } from "./managers/notion.js";
import chalk from "chalk";
import ora from "ora";
import path from "path";
import { Anthropic } from "@anthropic-ai/sdk";
import inquirer from "inquirer";
import { Client } from "@notionhq/client";

const ConfigSchema = z.object({
  notion: z.object({ auth: z.string(), databaseId: z.string() }),
  ai: z.object({
    anthropicKey: z.string().optional(),
    openaiKey: z.string().optional(),
    defaultModel: z.enum(["claude", "gpt4"]).default("claude"),
  }),
});

const RecipeSchema = z.object({
  name: z.string(),
  ingredients: z.array(z.string()),
  instructions: z.array(z.object({ text: z.string() })),
  cuisineType: z.string().nullable(),
  prepTime: z.string().nullable(),
  cookTime: z.string().nullable(),
  recipeYield: z.string().nullable(),
  notes: z.string().nullable(),
});

class RecipeCLI {
  private program: Command;
  private notionManager?: NotionRecipeManager;

  constructor() {
    this.program = new Command()
      .name("recipe-import")
      .description("Import recipes to Notion")
      .version("1.0.0");
    this.setupCommands();
  }

  private setupCommands() {
    this.program
      .command("import-photo <files...>")
      .option("-m, --model <model>", "AI model (claude/gpt4)", "claude")
      .option("-l, --language <language>", "Source language", "english")
      .option("-s, --single", "Treat multiple photos as single recipe", false)
      .action(
        async (files, options) => await this.handlePhotoImport(files, options)
      );

    this.program.command("init").action(async () => await this.handleInit());
  }

  private async loadConfig() {
    try {
      const configPath = new URL("../config.json", import.meta.url);
      return ConfigSchema.parse(
        JSON.parse(await fs.readFile(configPath, "utf-8"))
      );
    } catch (error) {
      console.error(chalk.red("Error loading config:"), error);
      process.exit(1);
    }
  }

  private async initNotionManager() {
    const config = await this.loadConfig();
    this.notionManager = new NotionRecipeManager(config.notion);
    await this.validateNotionDatabase();
  }

  private async validateNotionDatabase() {
    const spinner = ora("Validating database").start();
    try {
      const response = await this.notionManager!.notion.databases.retrieve({
        database_id: this.notionManager!.databaseId,
      });
      spinner.succeed("Database valid");
    } catch (error) {
      spinner.fail(`Validation failed: ${error.message}`);
      const shouldSetup = await inquirer.prompt([
        {
          type: "confirm",
          name: "setup",
          message: "Set up required properties?",
          default: true,
        },
      ]);
      if (shouldSetup.setup) await this.setupNotionDatabase();
      else throw error;
    }
  }

  private async setupNotionDatabase() {
    const spinner = ora("Setting up database").start();
    try {
      await this.notionManager!.notion.databases.update({
        database_id: this.notionManager!.databaseId,
        properties: {
          Name: { title: {} },
          URL: { url: {} },
          "Cuisine Type": {
            select: {
              options: [
                { name: "Italian", color: "blue" },
                { name: "Chinese", color: "red" },
                { name: "Japanese", color: "purple" },
                { name: "Indian", color: "orange" },
                { name: "American", color: "gray" },
                { name: "French", color: "pink" },
              ],
            },
          },
          Tags: {
            multi_select: {
              options: [
                { name: "Dinner", color: "yellow" },
                { name: "Lunch", color: "orange" },
                { name: "Breakfast", color: "blue" },
                { name: "Quick", color: "green" },
                { name: "Vegetarian", color: "purple" },
              ],
            },
          },
          "Prep Time": { number: {} },
          "Cook Time": { number: {} },
          Servings: { rich_text: {} },
        },
      });
      spinner.succeed("Database setup complete");
    } catch (error) {
      spinner.fail(`Setup failed: ${error.message}`);
      throw error;
    }
  }

  private async handlePhotoImport(
    files: string[],
    options: { model: string; language: string; single: boolean }
  ) {
    await this.initNotionManager();
    const config = await this.loadConfig();

    if (options.model === "gpt4" && !config.ai?.openaiKey)
      throw new Error("OpenAI API key required");
    if (options.model === "claude" && !config.ai?.anthropicKey)
      throw new Error("Anthropic API key required");

    const spinner = ora("Processing photos").start();

    try {
      if (options.single) {
        const images = await Promise.all(
          files.map(async (file) => ({
            buffer: await fs.readFile(file),
            base64: (await fs.readFile(file)).toString("base64"),
            filename: path.basename(file),
          }))
        );

        const recipe = await this.processMultipleImages(
          images,
          options,
          config
        );
        const finalRecipe = await this.reviewRecipe(recipe);
        if (!finalRecipe) {
          spinner.info("Import cancelled");
          return;
        }

        const pageId = await this.notionManager!.createRecipe(finalRecipe);
        for (const image of images) {
          await this.notionManager!.attachPhotoToRecipe(
            pageId,
            image.buffer,
            image.filename
          );
        }
        spinner.succeed(`Imported recipe with ${files.length} photos`);
      } else {
        for (const file of files) {
          const imageBuffer = await fs.readFile(file);
          const recipe = await this.processRecipeImage(
            imageBuffer.toString("base64"),
            options,
            config
          );
          const finalRecipe = await this.reviewRecipe(recipe);
          if (!finalRecipe) {
            spinner.info(`Skipped ${path.basename(file)}`);
            continue;
          }
          const pageId = await this.notionManager!.createRecipe(finalRecipe);
          await this.notionManager!.attachPhotoToRecipe(
            pageId,
            imageBuffer,
            path.basename(file)
          );
          spinner.succeed(`Imported ${path.basename(file)}`);
        }
      }
    } catch (error) {
      spinner.fail(`Processing failed: ${error.message}`);
    }
  }

  private async processMultipleImages(
    images: Array<{ base64: string; filename: string }>,
    options: { model: string; language: string },
    config: any
  ): Promise<Recipe> {
    const anthropic = new Anthropic({ apiKey: config.ai.anthropicKey });
    const prompt = `Analyze ${images.length} recipe images and structure as JSON: { "name": string, "ingredients": string[], "instructions": { "text": string }[], "cuisineType": string | null, "prepTime": string | null, "cookTime": string | null, "recipeYield": string | null, "notes": string | null }`;

    try {
      const message = await anthropic.messages.create({
        model:
          options.model === "gpt4"
            ? "claude-3-opus-20240229"
            : "claude-3-sonnet-20240229",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              ...images.map((img) => ({
                type: "image",
                source: {
                  type: "base64",
                  data: img.base64,
                  media_type: "image/jpeg",
                },
              })),
            ],
          },
        ],
      });

      const jsonMatch = message.content[0].text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Failed to extract JSON");
      return RecipeSchema.parse(JSON.parse(jsonMatch[0]));
    } catch (error) {
      throw new Error(`AI processing failed: ${error.message}`);
    }
  }

  private async handleInit() {
    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "auth",
        message: "Notion API key:",
        validate: (input) => input.length > 0,
      },
      {
        type: "confirm",
        name: "createNew",
        message: "Create new recipe database?",
        default: true,
      },
      {
        type: "input",
        name: "databaseId",
        message: "Existing database ID:",
        validate: (input) => input.length > 0,
        when: (answers) => !answers.createNew,
      },
      {
        type: "input",
        name: "anthropicKey",
        message: "Anthropic API key (optional):",
      },
      {
        type: "input",
        name: "openaiKey",
        message: "OpenAI API key (optional):",
      },
      {
        type: "list",
        name: "defaultModel",
        message: "Default AI model:",
        choices: [
          { name: "Claude", value: "claude" },
          { name: "GPT-4", value: "gpt4" },
        ],
        default: "claude",
      },
    ]);

    let databaseId = answers.databaseId;

    if (answers.createNew) {
      const spinner = ora("Fetching pages").start();
      try {
        const notion = new Client({ auth: answers.auth });
        const { results } = await notion.search({
          filter: { property: "object", value: "page" },
          page_size: 100,
        });

        spinner.stop();

        if (results.length === 0) {
          const pageResponse = await notion.pages.create({
            parent: { type: "workspace", workspace: true },
            properties: {
              title: [{ type: "text", text: { content: "Recipes" } }],
            },
          });
          results.push(pageResponse);
        }

        const pageChoices = [
          ...results.map((page) => ({
            name: page.properties?.title?.title?.[0]?.plain_text || "Untitled",
            value: page.id,
          })),
          { name: '+ Create new "Recipes" page', value: "new" },
        ];

        const pageAnswer = await inquirer.prompt([
          {
            type: "list",
            name: "parentId",
            message: "Where to create database?",
            choices: pageChoices,
          },
        ]);

        let parentId = pageAnswer.parentId;

        if (parentId === "new") {
          const createSpinner = ora("Creating page").start();
          const pageResponse = await notion.pages.create({
            parent: { type: "workspace", workspace: true },
            properties: {
              title: [{ type: "text", text: { content: "Recipes" } }],
            },
          });
          parentId = pageResponse.id;
          createSpinner.succeed("Created page");
        }

        const dbSpinner = ora("Creating database").start();
        const response = await notion.databases.create({
          parent: { type: "page_id", page_id: parentId },
          title: [{ type: "text", text: { content: "Recipe Database" } }],
          properties: {
            Name: { title: {} },
            URL: { url: {} },
            "Cuisine Type": {
              select: {
                options: [
                  { name: "Italian", color: "blue" },
                  { name: "Chinese", color: "red" },
                  { name: "Japanese", color: "purple" },
                ],
              },
            },
            Tags: {
              multi_select: {
                options: [
                  { name: "Dinner", color: "yellow" },
                  { name: "Quick", color: "green" },
                  { name: "Vegetarian", color: "orange" },
                ],
              },
            },
            "Prep Time": { number: {} },
            "Cook Time": { number: {} },
            Servings: { rich_text: {} },
          },
        });

        databaseId = response.id;
        dbSpinner.succeed(`Created database: ${databaseId}`);
      } catch (error) {
        spinner.fail(`Failed: ${error.message}`);
        process.exit(1);
      }
    }

    const config = {
      notion: { auth: answers.auth, databaseId },
      ai: {
        anthropicKey: answers.anthropicKey,
        openaiKey: answers.openaiKey,
        defaultModel: answers.defaultModel,
      },
    };

    await fs.writeFile("config.json", JSON.stringify(config, null, 2));
    console.log(chalk.green("Configuration saved"));
  }

  private async reviewRecipe(recipe: any): Promise<any> {
    console.log("\nExtracted Recipe:");
    console.log(chalk.blue("Name:"), recipe.name);
    console.log(chalk.blue("\nIngredients:"));
    recipe.ingredients.forEach((ing: string, i: number) =>
      console.log(chalk.gray(`${i + 1}.`), ing)
    );
    console.log(chalk.blue("\nInstructions:"));
    recipe.instructions.forEach((step: any, i: number) =>
      console.log(chalk.gray(`${i + 1}.`), step.text)
    );
    if (recipe.cuisineType)
      console.log(chalk.blue("\nCuisine:"), recipe.cuisineType);
    if (recipe.prepTime) console.log(chalk.blue("Prep Time:"), recipe.prepTime);
    if (recipe.cookTime) console.log(chalk.blue("Cook Time:"), recipe.cookTime);
    if (recipe.recipeYield)
      console.log(chalk.blue("Servings:"), recipe.recipeYield);
    if (recipe.notes) console.log(chalk.blue("\nNotes:"), recipe.notes);

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "Would you like to:",
        choices: [
          { name: "Save as is", value: "save" },
          { name: "Edit", value: "edit" },
          { name: "Cancel", value: "cancel" },
        ],
      },
    ]);

    if (action === "cancel") return null;
    if (action === "save") return recipe;

    const edited = await inquirer.prompt([
      {
        type: "input",
        name: "name",
        message: "Recipe name:",
        default: recipe.name,
      },
      {
        type: "editor",
        name: "ingredients",
        message: "Ingredients (one per line):",
        default: recipe.ingredients.join("\n"),
      },
      {
        type: "editor",
        name: "instructions",
        message: "Instructions (one step per line):",
        default: recipe.instructions.map((step: any) => step.text).join("\n"),
      },
      {
        type: "input",
        name: "cuisineType",
        message: "Cuisine type:",
        default: recipe.cuisineType || "",
      },
      {
        type: "input",
        name: "prepTime",
        message: "Prep time:",
        default: recipe.prepTime || "",
      },
      {
        type: "input",
        name: "cookTime",
        message: "Cook time:",
        default: recipe.cookTime || "",
      },
      {
        type: "input",
        name: "recipeYield",
        message: "Servings:",
        default: recipe.recipeYield || "",
      },
      {
        type: "editor",
        name: "notes",
        message: "Notes:",
        default: recipe.notes || "",
      },
    ]);

    return {
      ...edited,
      ingredients: edited.ingredients.split("\n").filter((x) => x.trim()),
      instructions: edited.instructions
        .split("\n")
        .filter((x) => x.trim())
        .map((text) => ({ text })),
    };
  }

  public async run() {
    await this.program.parseAsync(process.argv);
  }
}

const cli = new RecipeCLI();
cli.run().catch(console.error);
