import { Recipe as SchemaRecipe, Thing, WithContext } from "schema-dts";
import { JSDOM } from "jsdom";
import {
  ParselyRecipe,
  SchemaProcessor,
  SchemaErrorType,
  SchemaValidationError,
} from "../types/schema.js";

type RecipeData = {
  "@type": string | string[];
  name?: string | string[];
  recipeIngredient?: string | string[];
  recipeInstructions?: string | string[] | Array<{ text: string }>;
  recipeCuisine?: string | string[];
  prepTime?: string | string[];
  cookTime?: string | string[];
  recipeYield?: string | string[];
  url?: string;
};

export class RecipeSchemaProcessor implements SchemaProcessor {
  validate(schema: unknown): boolean {
    if (!this.isSchemaRecipe(schema)) {
      throw new SchemaValidationError(
        "Invalid Schema.org/Recipe data",
        SchemaErrorType.INVALID_SCHEMA,
        { schema }
      );
    }
    return true;
  }

  transform(schema: WithContext<SchemaRecipe>): ParselyRecipe {
    if (!this.validate(schema)) {
      throw new SchemaValidationError(
        "Invalid recipe schema",
        SchemaErrorType.INVALID_SCHEMA,
        { schema }
      );
    }

    // Handle both direct recipe and @graph containing recipe
    const recipeData = this.extractRecipeData(schema);

    return {
      name: this.extractText(recipeData.name) || "",
      ingredients: this.extractArray(recipeData.recipeIngredient),
      instructions: this.extractInstructions(recipeData.recipeInstructions),
      cuisineType: this.extractText(recipeData.recipeCuisine),
      prepTime: this.extractText(recipeData.prepTime),
      cookTime: this.extractText(recipeData.cookTime),
      recipeYield: this.extractText(recipeData.recipeYield),
      notes: null,
      source: {
        url: typeof recipeData.url === "string" ? recipeData.url : "",
        schemaType: Array.isArray(recipeData["@type"])
          ? recipeData["@type"].find((t) => t === "Recipe") || "Recipe"
          : recipeData["@type"],
        rawSchema: schema as unknown as Record<string, unknown>,
      },
    };
  }

  extractFromHtml(html: string): Array<WithContext<SchemaRecipe>> {
    const dom = new JSDOM(html);
    const { document } = dom.window;

    // Extract JSON-LD
    const jsonLdScripts = document.querySelectorAll(
      'script[type="application/ld+json"]'
    );
    const schemas: Array<WithContext<SchemaRecipe>> = [];

    jsonLdScripts.forEach((script) => {
      try {
        const data = JSON.parse(script.textContent || "");
        if (this.isSchemaRecipe(data)) {
          schemas.push(data);
        }
      } catch (error) {
        // Skip invalid JSON
      }
    });

    if (schemas.length === 0) {
      throw new SchemaValidationError(
        "No valid recipe schema found",
        SchemaErrorType.NO_SCHEMA_FOUND,
        { url: document.URL }
      );
    }

    return schemas;
  }

  private isSchemaRecipe(data: unknown): data is WithContext<SchemaRecipe> {
    if (!data || typeof data !== "object") return false;

    // Check if it's a WithContext type
    if (!("@context" in data && data["@context"] === "https://schema.org")) {
      return false;
    }

    // Handle both direct recipe and @graph containing recipe
    const recipeData = this.extractRecipeData(data as WithContext<Thing>);

    return (
      recipeData &&
      "@type" in recipeData &&
      (typeof recipeData["@type"] === "string"
        ? recipeData["@type"] === "Recipe"
        : Array.isArray(recipeData["@type"]) &&
          recipeData["@type"].includes("Recipe"))
    );
  }

  private extractRecipeData(schema: WithContext<Thing>): RecipeData {
    if ("@graph" in schema) {
      const graphData = schema["@graph"];
      if (Array.isArray(graphData)) {
        const recipe = graphData.find(
          (item): item is RecipeData =>
            typeof item === "object" &&
            item !== null &&
            "@type" in item &&
            (item["@type"] === "Recipe" ||
              (Array.isArray(item["@type"]) &&
                item["@type"].includes("Recipe")))
        );
        if (recipe) return recipe;
      }
    }
    return schema as unknown as RecipeData;
  }

  private extractText(value: string | string[] | undefined): string | null {
    if (!value) return null;
    return Array.isArray(value) ? value[0] : value;
  }

  private extractArray(value: string | string[] | undefined): string[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }

  private extractInstructions(
    value: string | string[] | Array<{ text: string }> | undefined
  ): Array<{ text: string }> {
    if (!value) return [];

    if (Array.isArray(value)) {
      return value.map((instruction) => {
        if (typeof instruction === "string") {
          return { text: instruction };
        }
        if (
          typeof instruction === "object" &&
          instruction &&
          "text" in instruction
        ) {
          return { text: String(instruction.text) };
        }
        return { text: String(instruction) };
      });
    }

    return [{ text: String(value) }];
  }
}
