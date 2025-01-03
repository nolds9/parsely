import inquirer from "inquirer";
import chalk from "chalk";
import { Recipe } from "../types/recipe.js";

export async function reviewRecipe(recipe: Recipe): Promise<Recipe | null> {
  console.log("\nExtracted Recipe:");
  console.log(chalk.blue("Name:"), recipe.name);
  console.log(chalk.blue("\nIngredients:"));
  recipe.ingredients.forEach((ing, i) =>
    console.log(chalk.gray(`${i + 1}.`), ing)
  );
  console.log(chalk.blue("\nInstructions:"));
  recipe.instructions.forEach((step, i) =>
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
      default: recipe.instructions.map((step) => step.text).join("\n"),
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
    ingredients: edited.ingredients.split("\n").filter((x: string) => x.trim()),
    instructions: edited.instructions
      .split("\n")
      .filter((x: string) => x.trim())
      .map((text: string) => ({ text })),
  };
}
