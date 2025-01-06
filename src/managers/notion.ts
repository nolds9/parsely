import { Client } from "@notionhq/client";
import type { BlockObjectRequest } from "@notionhq/client/build/src/api-endpoints.d.ts";
import {
  isNotionAPIResponseError as isAPIResponseError,
  retry,
  wait,
} from "../utils/notion.js";
import { Recipe } from "../types/recipe.js";

interface NotionConfig {
  auth: string;
  databaseId: string;
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
            number: recipe.prepTime
              ? this.parseTimeToMinutes(recipe.prepTime)
              : null,
          },
          "Cook Time": {
            number: recipe.cookTime
              ? this.parseTimeToMinutes(recipe.cookTime)
              : null,
          },
          "Total Time": {
            rich_text: [{ text: { content: recipe.totalTime || "" } }],
          },
          Servings: {
            rich_text: [{ text: { content: recipe.recipeYield || "" } }],
          },
          URL: {
            url: recipe.url || recipe.source?.url || "",
          },
          Notes: {
            rich_text: [
              {
                text: {
                  content: this.formatAdditionalInfo(recipe),
                },
              },
            ],
          },
          Description: {
            rich_text: [{ text: { content: recipe.description || "" } }],
          },
          Keywords: {
            multi_select:
              recipe.keywords?.map((keyword) => ({ name: keyword })) || [],
          },
          Category: {
            select: recipe.category ? { name: recipe.category } : null,
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
          ...(recipe.description
            ? [
                {
                  object: "block" as const,
                  type: "paragraph" as const,
                  paragraph: {
                    rich_text: [{ text: { content: recipe.description } }],
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
    const debug = process.env.DEBUG === "true";
    const log = (message: string) => {
      if (debug) console.log(`[Notion Update] ${message}`);
    };

    try {
      // Step 1: Update properties
      log("Updating page properties...");
      await retry(() =>
        this.notion.pages.update({
          page_id: pageId,
          properties: {
            Name: {
              title: [{ text: { content: recipe.name } }],
            },
            "Cuisine Type": {
              select: recipe.cuisineType ? { name: recipe.cuisineType } : null,
            },
            "Prep Time": {
              number: recipe.prepTime
                ? this.parseTimeToMinutes(recipe.prepTime)
                : null,
            },
            "Cook Time": {
              number: recipe.cookTime
                ? this.parseTimeToMinutes(recipe.cookTime)
                : null,
            },
            "Total Time": {
              rich_text: [{ text: { content: recipe.totalTime || "" } }],
            },
            Servings: {
              rich_text: [{ text: { content: recipe.recipeYield || "" } }],
            },
            URL: {
              url: recipe.url || recipe.source?.url || "",
            },
            Notes: {
              rich_text: [
                {
                  text: {
                    content: this.formatAdditionalInfo(recipe),
                  },
                },
              ],
            },
            Description: {
              rich_text: [{ text: { content: recipe.description || "" } }],
            },
            Keywords: {
              multi_select: [
                ...(recipe.keywords?.map((keyword) => ({
                  name: keyword.trim(),
                })) || []),
                ...(recipe.category
                  ? recipe.category
                      .split(",")
                      .slice(1)
                      .map((cat) => ({ name: cat.trim() }))
                  : []),
              ],
            },
            Category: {
              select: recipe.category
                ? { name: recipe.category.split(",")[0].trim() }
                : null,
            },
          },
        })
      );
      log("✓ Properties updated");

      // Step 2: Get existing blocks
      log("Fetching existing blocks...");
      let allBlocks = [];
      let cursor = undefined;
      do {
        const { results, next_cursor } = await this.notion.blocks.children.list(
          {
            block_id: pageId,
            start_cursor: cursor,
            page_size: 100,
          }
        );
        allBlocks.push(...results);
        cursor = next_cursor;
      } while (cursor);
      log(`✓ Found ${allBlocks.length} blocks to delete`);

      // Step 3: Delete blocks sequentially
      log("Deleting existing blocks...");
      for (const block of allBlocks) {
        try {
          await retry(() =>
            this.notion.blocks.delete({
              block_id: block.id,
            })
          );
          // Small delay between deletions
          await wait(100);
        } catch (error) {
          if (isAPIResponseError(error)) {
            log(`Failed to delete block ${block.id}: ${error.message}`);
          }
          throw error;
        }
      }
      log("✓ All blocks deleted");

      // Step 4: Wait a moment before appending
      await wait(500);

      // Step 5: Append new blocks
      log("Appending new blocks...");
      await retry(() =>
        this.notion.blocks.children.append({
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
            ...(recipe.description
              ? [
                  {
                    object: "block" as const,
                    type: "paragraph" as const,
                    paragraph: {
                      rich_text: [{ text: { content: recipe.description } }],
                    },
                  } as BlockObjectRequest,
                ]
              : []),
          ],
        })
      );
      log("✓ New blocks appended");
    } catch (error) {
      log(`❌ Update failed: ${error}`);
      if (isAPIResponseError(error)) {
        const details = {
          code: error.code,
          status: error.status,
          message: error.message,
        };
        log(`API Error details: ${JSON.stringify(details, null, 2)}`);
        throw new Error(`Failed to update recipe: ${error.message}`);
      }
      throw error instanceof Error
        ? error
        : new Error("An unknown error occurred");
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

  private parseTimeToMinutes(timeStr: string): number | null {
    try {
      // Handle ISO duration format (PT1H30M)
      if (timeStr.startsWith("PT")) {
        const hours = timeStr.match(/(\d+)H/)?.[1] || "0";
        const minutes = timeStr.match(/(\d+)M/)?.[1] || "0";
        return parseInt(hours) * 60 + parseInt(minutes);
      }

      // Handle simple minute strings
      if (timeStr.toLowerCase().includes("min")) {
        return parseInt(timeStr);
      }

      return null;
    } catch {
      return null;
    }
  }

  private formatAdditionalInfo(recipe: Recipe): string {
    const parts: string[] = [];

    if (recipe.notes) {
      parts.push(recipe.notes);
    }

    return parts.join("\n");
  }
}
