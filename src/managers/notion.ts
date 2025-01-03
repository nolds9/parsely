import { Client } from "@notionhq/client";
import type { BlockObjectRequest } from "@notionhq/client/build/src/api-endpoints.d.ts";
import type { APIResponseError } from "@notionhq/client/build/src/errors.d.ts";

interface NotionConfig {
  auth: string;
  databaseId: string;
}

interface Recipe {
  name: string;
  ingredients: string[];
  instructions: { text: string }[];
  cuisineType: string | null;
  prepTime: string | null;
  cookTime: string | null;
  recipeYield: string | null;
  notes: string | null;
}

function isAPIResponseError(error: unknown): error is APIResponseError {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    "status" in error
  );
}

export class NotionRecipeManager {
  public notion: Client;
  public databaseId: string;

  constructor(config: NotionConfig) {
    this.notion = new Client({ auth: config.auth });
    this.databaseId = config.databaseId;
  }

  async createRecipe(recipe: Recipe): Promise<string> {
    try {
      const response = await this.notion.pages.create({
        parent: { database_id: this.databaseId },
        properties: {
          Name: {
            title: [{ text: { content: recipe.name } }],
          },
          "Cuisine Type": {
            select: recipe.cuisineType ? { name: recipe.cuisineType } : null,
          },
          "Prep Time": {
            number: recipe.prepTime ? parseInt(recipe.prepTime) : null,
          },
          "Cook Time": {
            number: recipe.cookTime ? parseInt(recipe.cookTime) : null,
          },
          Servings: {
            rich_text: [{ text: { content: recipe.recipeYield || "" } }],
          },
        },
        children: [
          {
            object: "block" as const,
            type: "heading_2" as const,
            heading_2: {
              rich_text: [{ text: { content: "Ingredients" } }],
            },
          } as BlockObjectRequest,
          ...recipe.ingredients.map(
            (ingredient): BlockObjectRequest => ({
              object: "block" as const,
              type: "bulleted_list_item" as const,
              bulleted_list_item: {
                rich_text: [{ text: { content: ingredient } }],
              },
            })
          ),
          {
            object: "block" as const,
            type: "heading_2" as const,
            heading_2: {
              rich_text: [{ text: { content: "Instructions" } }],
            },
          } as BlockObjectRequest,
          ...recipe.instructions.map(
            (instruction): BlockObjectRequest => ({
              object: "block" as const,
              type: "numbered_list_item" as const,
              numbered_list_item: {
                rich_text: [{ text: { content: instruction.text } }],
              },
            })
          ),
          ...(recipe.notes
            ? [
                {
                  object: "block" as const,
                  type: "heading_2" as const,
                  heading_2: {
                    rich_text: [{ text: { content: "Notes" } }],
                  },
                } as BlockObjectRequest,
                {
                  object: "block" as const,
                  type: "paragraph" as const,
                  paragraph: {
                    rich_text: [{ text: { content: recipe.notes } }],
                  },
                } as BlockObjectRequest,
              ]
            : []),
        ],
      });

      return response.id;
    } catch (error) {
      if (isAPIResponseError(error)) {
        throw new Error(`Failed to create recipe: ${error.message}`);
      }
      throw error;
    }
  }

  async updateRecipe(pageId: string, recipe: Recipe): Promise<void> {
    try {
      // First update the properties
      await this.notion.pages.update({
        page_id: pageId,
        properties: {
          Name: {
            title: [{ text: { content: recipe.name } }],
          },
          "Cuisine Type": {
            select: recipe.cuisineType ? { name: recipe.cuisineType } : null,
          },
          "Prep Time": {
            number: recipe.prepTime ? parseInt(recipe.prepTime) : null,
          },
          "Cook Time": {
            number: recipe.cookTime ? parseInt(recipe.cookTime) : null,
          },
          Servings: {
            rich_text: [{ text: { content: recipe.recipeYield || "" } }],
          },
        },
      });

      // Then delete existing content blocks
      const { results } = await this.notion.blocks.children.list({
        block_id: pageId,
      });

      for (const block of results) {
        await this.notion.blocks.delete({
          block_id: block.id,
        });
      }

      // Finally add new content blocks
      await this.notion.blocks.children.append({
        block_id: pageId,
        children: [
          {
            object: "block" as const,
            type: "heading_2" as const,
            heading_2: {
              rich_text: [{ text: { content: "Ingredients" } }],
            },
          } as BlockObjectRequest,
          ...recipe.ingredients.map(
            (ingredient): BlockObjectRequest => ({
              object: "block" as const,
              type: "bulleted_list_item" as const,
              bulleted_list_item: {
                rich_text: [{ text: { content: ingredient } }],
              },
            })
          ),
          {
            object: "block" as const,
            type: "heading_2" as const,
            heading_2: {
              rich_text: [{ text: { content: "Instructions" } }],
            },
          } as BlockObjectRequest,
          ...recipe.instructions.map(
            (instruction): BlockObjectRequest => ({
              object: "block" as const,
              type: "numbered_list_item" as const,
              numbered_list_item: {
                rich_text: [{ text: { content: instruction.text } }],
              },
            })
          ),
          ...(recipe.notes
            ? [
                {
                  object: "block" as const,
                  type: "heading_2" as const,
                  heading_2: {
                    rich_text: [{ text: { content: "Notes" } }],
                  },
                } as BlockObjectRequest,
                {
                  object: "block" as const,
                  type: "paragraph" as const,
                  paragraph: {
                    rich_text: [{ text: { content: recipe.notes } }],
                  },
                } as BlockObjectRequest,
              ]
            : []),
        ],
      });
    } catch (error) {
      if (isAPIResponseError(error)) {
        throw new Error(`Failed to update recipe: ${error.message}`);
      }
      throw error;
    }
  }

  async findRecipeByUrl(url: string): Promise<string | null> {
    try {
      const response = await this.notion.databases.query({
        database_id: this.databaseId,
        filter: {
          property: "URL",
          url: {
            equals: url,
          },
        },
      });

      return response.results[0]?.id || null;
    } catch (error) {
      if (isAPIResponseError(error)) {
        throw new Error(`Failed to search for recipe: ${error.message}`);
      }
      throw error;
    }
  }

  async attachPhotoToRecipe(
    pageId: string,
    imageBuffer: Buffer,
    filename: string
  ): Promise<void> {
    try {
      await this.notion.blocks.children.append({
        block_id: pageId,
        children: [
          {
            object: "block" as const,
            type: "image" as const,
            image: {
              type: "external" as const,
              external: {
                url: "data:image/jpeg;base64," + imageBuffer.toString("base64"),
              },
            },
          } as BlockObjectRequest,
        ],
      });
    } catch (error) {
      if (isAPIResponseError(error)) {
        if (error.message.includes("file size")) {
          throw new Error(
            "Image file is too large. Please use a smaller image."
          );
        } else if (error.message.includes("file type")) {
          throw new Error("Unsupported image format. Please use JPEG or PNG.");
        }
        throw new Error(`Failed to attach photo: ${error.message}`);
      }
      throw error instanceof Error
        ? error
        : new Error("An unknown error occurred");
    }
  }

  private getContentType(filename: string): string {
    const ext = filename.toLowerCase().split(".").pop();
    switch (ext) {
      case "jpg":
      case "jpeg":
        return "image/jpeg";
      case "png":
        return "image/png";
      case "gif":
        return "image/gif";
      default:
        return "image/jpeg"; // default to jpeg
    }
  }
}
