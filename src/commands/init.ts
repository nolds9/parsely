import { Command } from "commander";
import inquirer from "inquirer";
import { Client } from "@notionhq/client";
import ora from "ora";
import chalk from "chalk";
import { Config } from "../types/config.js";
import { ConfigManager } from "../managers/config.js";
import { isNotionAPIResponseError } from "../utils/notion.js";

// Add types for Notion formats
type NotionColor =
  | "blue"
  | "red"
  | "purple"
  | "green"
  | "yellow"
  | "orange"
  | "brown"
  | "gray"
  | "pink";
type NumberFormat =
  | "number"
  | "number_with_commas"
  | "percent"
  | "dollar"
  | "euro"
  | "pound"
  | "yen"
  | "ruble"
  | "rupee"
  | "won"
  | "yuan";

async function setupNotionDatabase(
  auth: string,
  specifiedPageId?: string
): Promise<string> {
  const spinner = ora("Fetching pages").start();
  try {
    const notion = new Client({ auth });

    // If a specific page ID is provided, use it directly
    if (specifiedPageId) {
      const dbSpinner = ora("Creating database").start();
      const databaseProperties = {
        Name: { title: {} },
        URL: { url: {} },
        "Cuisine Type": {
          select: {
            options: [
              { name: "Italian", color: "blue" as NotionColor },
              { name: "Chinese", color: "red" as NotionColor },
              { name: "Japanese", color: "purple" as NotionColor },
              { name: "French", color: "green" as NotionColor },
              { name: "American", color: "yellow" as NotionColor },
            ],
          },
        },
        Tags: {
          multi_select: {
            options: [
              { name: "Dinner", color: "yellow" as NotionColor },
              { name: "Quick", color: "green" as NotionColor },
              { name: "Vegetarian", color: "orange" as NotionColor },
              { name: "Breakfast", color: "blue" as NotionColor },
              { name: "Lunch", color: "red" as NotionColor },
            ],
          },
        },
        "Prep Time": { number: { format: "number" as NumberFormat } },
        "Cook Time": { number: { format: "number" as NumberFormat } },
        "Total Time": { rich_text: {} },
        Servings: { rich_text: {} },
        Notes: { rich_text: {} },
        Description: { rich_text: {} },
        Keywords: { multi_select: {} },
        Category: { select: {} },
      };
      const response = await notion.databases.create({
        parent: { type: "page_id", page_id: specifiedPageId },
        title: [{ type: "text", text: { content: "Recipe Database" } }],
        properties: databaseProperties,
      });
      dbSpinner.succeed(`Created database: ${response.id}`);
      return response.id;
    }

    const { results } = await notion.search({
      filter: { property: "object", value: "page" },
      page_size: 100,
    });

    spinner.stop();

    if (results.length === 0) {
      spinner.fail(
        "No pages found. Please make sure to:\n" +
          "1. Create a page in Notion\n" +
          "2. Share the page with your integration:\n" +
          "   - Go to the page in Notion\n" +
          "   - Click '...' menu in the top right\n" +
          "   - Select 'Add connections'\n" +
          "   - Find and select your integration\n" +
          "Try running 'parsely init' again after sharing the page."
      );
      throw new Error("No pages found - integration needs page access");
    }

    const pageChoices = [
      ...results.map((page) => {
        if ("properties" in page && page.properties.title) {
          const titleProperty = page.properties.title;
          if ("title" in titleProperty) {
            return {
              name:
                Array.isArray(titleProperty.title) && titleProperty.title[0]
                  ? titleProperty.title[0].plain_text
                  : "Untitled",
              value: page.id,
            };
          }
        }
        return {
          name: "Untitled",
          value: page.id,
        };
      }),
    ];

    const pageAnswer = await inquirer.prompt([
      {
        type: "list",
        name: "parentId",
        message: "Select page to create database in:",
        choices: pageChoices,
      },
    ]);

    const dbSpinner = ora("Creating database").start();
    const databaseProperties = {
      Name: { title: {} },
      URL: { url: {} },
      "Cuisine Type": {
        select: {
          options: [
            { name: "Italian", color: "blue" as NotionColor },
            { name: "Chinese", color: "red" as NotionColor },
            { name: "Japanese", color: "purple" as NotionColor },
            { name: "French", color: "green" as NotionColor },
            { name: "American", color: "yellow" as NotionColor },
          ],
        },
      },
      Tags: {
        multi_select: {
          options: [
            { name: "Dinner", color: "yellow" as NotionColor },
            { name: "Quick", color: "green" as NotionColor },
            { name: "Vegetarian", color: "orange" as NotionColor },
            { name: "Breakfast", color: "blue" as NotionColor },
            { name: "Lunch", color: "red" as NotionColor },
          ],
        },
      },
      "Prep Time": { number: { format: "number" as NumberFormat } },
      "Cook Time": { number: { format: "number" as NumberFormat } },
      "Total Time": { rich_text: {} },
      Servings: { rich_text: {} },
      Notes: { rich_text: {} },
      Description: { rich_text: {} },
      Keywords: { multi_select: {} },
      Category: { select: {} },
    };
    const response = await notion.databases.create({
      parent: { type: "page_id", page_id: pageAnswer.parentId },
      title: [{ type: "text", text: { content: "Recipe Database" } }],
      properties: databaseProperties,
    });

    dbSpinner.succeed(`Created database: ${response.id}`);
    return response.id;
  } catch (error) {
    if (isNotionAPIResponseError(error)) {
      spinner.fail(`Failed: ${error.message}`);
    } else {
      spinner.fail(`Failed: ${error}`);
    }
    throw error;
  }
}

export async function executeInit(): Promise<void> {
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "auth",
      message: "Notion API key:",
      validate: (input) => input.length > 0,
    },
    {
      type: "list",
      name: "dbSetup",
      message: "How would you like to setup the database?",
      choices: [
        { name: "Interactive selection", value: "interactive" },
        { name: "Specify page ID", value: "specify" },
        { name: "Use existing database", value: "existing" },
      ],
    },
    {
      type: "input",
      name: "pageId",
      message: "Page ID to create database in:",
      validate: (input) => input.length > 0,
      when: (answers) => answers.dbSetup === "specify",
    },
    {
      type: "input",
      name: "databaseId",
      message: "Existing database ID:",
      validate: (input) => input.length > 0,
      when: (answers) => answers.dbSetup === "existing",
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
  if (answers.dbSetup === "interactive" || answers.dbSetup === "specify") {
    databaseId = await setupNotionDatabase(answers.auth, answers.pageId);
  }

  const config: Config = {
    notion: { auth: answers.auth, databaseId },
    ai: {
      anthropicKey: answers.anthropicKey || undefined,
      openaiKey: answers.openaiKey || undefined,
      defaultModel: answers.defaultModel,
    },
  };

  await ConfigManager.save(config);
  console.log(chalk.green("Configuration saved"));
}

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize configuration")
    .action(async () => {
      try {
        await executeInit();
      } catch (error) {
        console.error(error);
        process.exit(1);
      }
    });
}
