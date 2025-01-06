import { Recipe as SchemaRecipe, WithContext } from "schema-dts";
import { Recipe } from "./recipe.js";

export enum SchemaErrorType {
  NO_SCHEMA_FOUND = "NO_SCHEMA_FOUND",
  INVALID_SCHEMA = "INVALID_SCHEMA",
  FETCH_ERROR = "FETCH_ERROR",
  RATE_LIMITED = "RATE_LIMITED",
  PARSING_ERROR = "PARSING_ERROR",
}

export class SchemaValidationError extends Error {
  constructor(
    message: string,
    public type: SchemaErrorType,
    public details: Record<string, unknown>
  ) {
    super(message);
    this.name = "SchemaValidationError";
  }
}

export interface SchemaProcessor {
  validate(schema: unknown): boolean;
  transform(schema: WithContext<SchemaRecipe>): Recipe;
  extractFromHtml(html: string): Array<WithContext<SchemaRecipe>>;
}
