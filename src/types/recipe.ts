export interface Recipe {
  name: string;
  ingredients: string[];
  instructions: { text: string }[];
  cuisineType: string | null;
  prepTime: string | null;
  cookTime: string | null;
  recipeYield: string | null;
  notes: string | null;
}

export interface RecipeImportOptions {
  model: "claude" | "gpt4";
  language: string;
  single: boolean;
}
