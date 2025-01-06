/**
 * Core recipe representation used throughout the application
 */
export interface Recipe {
  name: string;
  ingredients: string[];
  instructions: { text: string }[];
  cuisineType: string | null;
  prepTime: string | null;
  cookTime: string | null;
  totalTime?: string | null;
  recipeYield: string | null;
  notes: string | null;
  description?: string | null;
  keywords?: string[];
  category?: string | null;
  url?: string;
  source?: {
    url: string;
    schemaType: string;
    rawSchema?: Record<string, unknown>;
  };
}

export interface RecipeImportOptions {
  model: "claude" | "gpt4";
  language: string;
  single: boolean;
}
