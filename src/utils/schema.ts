import { Recipe as SchemaRecipe, Thing, WithContext } from "schema-dts";
import { JSDOM } from "jsdom";
import {
  SchemaProcessor,
  SchemaErrorType,
  SchemaValidationError,
} from "../types/schema.js";
import { Recipe } from "../types/recipe.js";

/**
 * Intermediate type for parsing raw Schema.org recipe data.
 * This type reflects the structure of raw data we might receive,
 * before it's transformed into our internal Recipe type.
 */
type RecipeData = {
  "@type": string | string[]; // Schema.org type identifier
  name?: string | string[]; // Raw recipe name
  recipeIngredient?: string | string[]; // Raw ingredients list
  recipeInstructions?: string | string[] | Array<{ text: string }>; // Raw instructions
  recipeCuisine?: string | string[]; // Raw cuisine type
  prepTime?: string | string[]; // Raw prep time
  cookTime?: string | string[]; // Raw cook time
  totalTime?: string | string[]; // Raw total time
  recipeYield?: string | string[]; // Raw yield/servings
  url?: string; // Recipe URL
  description?: string | string[]; // Raw description
  recipeCategory?: string | string[]; // Raw category
  keywords?: string | string[]; // Raw keywords
  author?: string | string[]; // Raw author info
};

const DEBUG = process.env.DEBUG === "true";

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

  transform(schema: WithContext<SchemaRecipe>): Recipe {
    if (!this.validate(schema)) {
      throw new SchemaValidationError(
        "Invalid recipe schema",
        SchemaErrorType.INVALID_SCHEMA,
        { schema }
      );
    }

    // Handle both direct recipe and @graph containing recipe
    const recipeData = this.extractRecipeData(schema);

    // Take only the first category if multiple are provided
    const category = this.extractText(recipeData.recipeCategory);
    const keywords = this.extractKeywords(recipeData.keywords || []);

    // If we have multiple categories, add the rest to keywords
    if (recipeData.recipeCategory && Array.isArray(recipeData.recipeCategory)) {
      keywords.push(...recipeData.recipeCategory.slice(1));
    }

    return {
      name: this.extractText(recipeData.name) || "",
      ingredients: this.extractArray(recipeData.recipeIngredient),
      instructions: this.extractInstructions(recipeData.recipeInstructions),
      cuisineType: this.extractText(recipeData.recipeCuisine),
      prepTime: this.extractText(recipeData.prepTime),
      cookTime: this.extractText(recipeData.cookTime),
      totalTime: this.extractText(recipeData.totalTime),
      recipeYield: this.extractText(recipeData.recipeYield),
      notes: null,
      description: this.extractText(recipeData.description),
      category: category, // Will be a single value or null
      keywords: keywords, // Array of keywords including additional categories
      url: typeof recipeData.url === "string" ? recipeData.url : "",
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

    const jsonLdScripts = document.querySelectorAll(
      'script[type="application/ld+json"]'
    );

    const schemas: Array<WithContext<SchemaRecipe>> = [];
    const recipeSchemas: Array<{
      schema: WithContext<SchemaRecipe>;
      score: number;
    }> = [];

    jsonLdScripts.forEach((script) => {
      try {
        const data = JSON.parse(script.textContent || "");

        if (this.isSchemaRecipe(data)) {
          // Score the recipe schema based on completeness
          const score = this.scoreRecipeSchema(data);
          recipeSchemas.push({ schema: data, score });
        }
      } catch (error) {
        if (DEBUG) {
          console.log("Error parsing JSON-LD script:", error);
        }
      }
    });

    // Sort by score and take the most complete recipe schema
    if (recipeSchemas.length > 0) {
      recipeSchemas.sort((a, b) => b.score - a.score);
      schemas.push(recipeSchemas[0].schema);
    }

    if (schemas.length === 0) {
      throw new SchemaValidationError(
        "No valid recipe schema found",
        SchemaErrorType.NO_SCHEMA_FOUND,
        {
          url: document.URL,
          htmlLength: html.length,
          jsonLdCount: jsonLdScripts.length,
        }
      );
    }

    return schemas;
  }

  private isSchemaRecipe(data: unknown): data is WithContext<SchemaRecipe> {
    if (!data || typeof data !== "object") return false;

    // Check if it's a WithContext type with schema.org context
    if (
      !(
        "@context" in data &&
        (data["@context"] === "https://schema.org" ||
          data["@context"] === "http://schema.org")
      )
    ) {
      return false;
    }

    // Handle both direct recipe and @graph containing recipe
    const recipeData = this.extractRecipeData(data as WithContext<Thing>);

    // Check if it's a Recipe type and has required fields
    const isRecipe =
      recipeData &&
      "@type" in recipeData &&
      (typeof recipeData["@type"] === "string"
        ? recipeData["@type"] === "Recipe"
        : Array.isArray(recipeData["@type"]) &&
          recipeData["@type"].includes("Recipe"));

    // Require at least name and either ingredients or instructions
    const hasRequiredFields =
      recipeData &&
      "name" in recipeData &&
      ("recipeIngredient" in recipeData || "recipeInstructions" in recipeData);

    return isRecipe && hasRequiredFields;
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

  private scoreRecipeSchema(schema: WithContext<SchemaRecipe>): number {
    const recipeData = this.extractRecipeData(schema);
    let score = 0;

    // Core fields
    if (recipeData.name) score += 10;
    if (recipeData.recipeIngredient) score += 10;
    if (recipeData.recipeInstructions) score += 10;

    // Additional fields
    if (recipeData.recipeCuisine) score += 2;
    if (recipeData.prepTime) score += 2;
    if (recipeData.cookTime) score += 2;
    if (recipeData.recipeYield) score += 2;
    if (recipeData.description) score += 1;
    if (recipeData.author) score += 1;

    // Score based on completeness of arrays
    if (Array.isArray(recipeData.recipeIngredient)) {
      score += Math.min(recipeData.recipeIngredient.length, 5);
    }
    if (Array.isArray(recipeData.recipeInstructions)) {
      score += Math.min(recipeData.recipeInstructions.length, 5);
    }

    return score;
  }

  private extractKeywords(value: string | string[] | undefined): string[] {
    if (!value) return [];
    if (typeof value === "string") {
      return value.split(/,\s*/);
    }
    return Array.isArray(value) ? value : [];
  }
}
