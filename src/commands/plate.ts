import { Command } from "commander";
import ora from "ora";
import fs from "fs/promises";
import path from "path";
import YAML from "yaml";
import { RecipeSchemaProcessor } from "../utils/schema.js";
import { Recipe } from "../types/recipe.js";
export interface PlateOptions {
  input: string;
  format: "json" | "yaml" | "markdown";
  includeRaw?: boolean;
  pretty?: boolean;
}

export interface PlateResult {
  recipe: Recipe;
  rawSchema?: Record<string, unknown>;
  metadata: {
    source: string;
    extractedAt: string;
    schemaType: string;
  };
}

async function loadRecipeFile(filePath: string): Promise<Recipe> {
  const content = await fs.readFile(filePath, "utf-8");
  return JSON.parse(content) as Recipe;
}

function formatRecipe(
  result: PlateResult,
  format: string,
  pretty = false
): string {
  switch (format) {
    case "json":
      return JSON.stringify(result, null, pretty ? 2 : 0);
    case "yaml":
      return YAML.stringify(result);
    case "markdown":
      return `# ${result.recipe.name}

## Ingredients
${result.recipe.ingredients.map((i) => `- ${i}`).join("\n")}

## Instructions
${result.recipe.instructions
  .map((i, idx) => `${idx + 1}. ${i.text}`)
  .join("\n")}

${result.recipe.notes ? `\n## Notes\n${result.recipe.notes}` : ""}

---
Source: ${result.metadata.source}
Extracted: ${result.metadata.extractedAt}
`;
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

export async function executePlate(options: PlateOptions): Promise<void> {
  const spinner = ora("Processing recipe").start();
  const schemaProcessor = new RecipeSchemaProcessor();

  try {
    let recipe: Recipe;
    let rawSchema: Record<string, unknown> | undefined;

    // Handle URL or file input
    if (options.input.startsWith("http")) {
      spinner.text = "Fetching recipe from URL";
      const response = await fetch(options.input);
      const html = await response.text();
      const schemas = schemaProcessor.extractFromHtml(html);
      const schema = schemas[0]; // Take first valid recipe schema
      recipe = schemaProcessor.transform(schema);
      rawSchema = options.includeRaw
        ? (schema as unknown as Record<string, unknown>)
        : undefined;
    } else {
      spinner.text = "Loading recipe from file";
      recipe = await loadRecipeFile(options.input);
    }

    const result: PlateResult = {
      recipe,
      ...(options.includeRaw && rawSchema && { rawSchema }),
      metadata: {
        source: options.input,
        extractedAt: new Date().toISOString(),
        schemaType: recipe.source?.schemaType || "Recipe",
      },
    };

    const output = formatRecipe(result, options.format, options.pretty);

    // Generate output filename based on input and format
    const outputName = path.basename(
      options.input,
      path.extname(options.input)
    );
    const outputPath = `${outputName}.${options.format}`;

    await fs.writeFile(outputPath, output);

    spinner.succeed(`Recipe exported to ${outputPath}`);
  } catch (error) {
    spinner.fail("Processing failed");
    throw error;
  }
}

export function registerPlateCommand(program: Command): void {
  program
    .command("plate <input>")
    .description("Convert recipe between different formats")
    .option(
      "-f, --format <format>",
      "Output format (json|yaml|markdown)",
      "json"
    )
    .option("-r, --include-raw", "Include raw schema.org data")
    .option("-p, --pretty", "Pretty print output")
    .action(
      async (
        input,
        cmdOptions: { format?: string; includeRaw?: boolean; pretty?: boolean }
      ) => {
        try {
          await executePlate({
            input,
            format: (cmdOptions.format || "json") as
              | "json"
              | "yaml"
              | "markdown",
            includeRaw: cmdOptions.includeRaw,
            pretty: cmdOptions.pretty,
          });
        } catch (error) {
          console.error(
            "Error:",
            error instanceof Error ? error.message : error
          );
          process.exit(1);
        }
      }
    );
}
