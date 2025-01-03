import { Command } from "commander";
import inquirer from "inquirer";
import { Client } from "@notionhq/client";
import ora from "ora";
import chalk from "chalk";
import { Config } from "../types/config.js";
import { ConfigManager } from "../managers/config.js";
import { isNotionAPIResponseError } from "../utils/notion.js";

async function setupNotionDatabase(auth: string): Promise<string> {
  const spinner = ora("Fetching pages").start();
  try {
    const notion = new Client({ auth });
    const { results } = await notion.search({
      filter: { property: "object", value: "page" },
      page_size: 100,
    });

    spinner.stop();

    if (results.length === 0) {
      const pageResponse = await notion.pages.create({
        parent: { page_id: "workspace" },
        properties: {
          title: {
            title: [{ type: "text", text: { content: "Recipes" } }],
          },
        },
      });
      results.push(pageResponse);
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
        parent: { page_id: "workspace" },
        properties: {
          title: {
            title: [{ type: "text", text: { content: "Recipes" } }],
          },
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
    databaseId = await setupNotionDatabase(answers.auth);
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
