# Parsely CLI - Product Requirements Document

## Overview

Parsely is a command-line interface tool for importing recipes from various sources (web, photos) and exporting them to Notion databases. The project needs to be refactored from its current state into a more modular, maintainable structure with clear separation of concerns.

## Project Structure

Convert the current flat structure into:

```
parsely/
├── src/
│   ├── commands/          # Command implementations
│   │   ├── chop.ts        # Web scraping (NYT, etc.)
│   │   ├── scan.ts        # Photo processing
│   │   └── plate.ts       # Data manipulation
│   │   └── init.ts        # Configuration
│   ├── managers/          # Service integrations
│   │   └── notion.ts      # Notion API wrapper
│   ├── types/             # Shared type definitions
│   │   ├── recipe.ts      # Recipe interfaces
│   │   └── config.ts      # Configuration types
│   ├── utils/             # Shared utilities
│   │   ├── config.ts      # Config management
│   │   └── prompts.ts     # CLI prompts
│   └── index.ts           # CLI entry point
```

## Command Structure

Each command should follow this pattern:

```typescript
export interface CommandOptions {
  // Command-specific options
}

export async function executeCommand(options: CommandOptions): Promise<void> {
  // Command implementation
}

export function registerCommand(program: Command): void {
  program
    .command("command-name")
    .description("Command description")
    .option("-o, --option", "Option description")
    .action(async (options) => {
      try {
        await executeCommand(options);
      } catch (error) {
        // Error handling
      }
    });
}
```

## Key Refactoring Tasks

### 1. Command Migration

- Move from RecipeCLI class to individual command modules
- Rename commands to match the new CLI vocabulary:
  - `import-photo` → `scan`
  - `import-web` → `chop`
  - `export` → `plate`
  - Keep `init` as is

### 2. Type Definitions and Schema Handling

#### Recipe Schema Types

```typescript
// Using schema-dts for Schema.org type definitions
import { Recipe as SchemaRecipe, WithContext } from "schema-dts";

// Internal recipe representation
export interface ParselyRecipe {
  name: string;
  ingredients: string[];
  instructions: Array<{ text: string }>;
  cuisineType: string | null;
  prepTime: string | null;
  cookTime: string | null;
  recipeYield: string | null;
  notes: string | null;
  source?: {
    url: string;
    schemaType: string;
    rawSchema?: Record<string, unknown>;
  };
}

// Schema validation and transformation
export interface SchemaProcessor {
  validate(schema: unknown): boolean;
  transform(schema: WithContext<SchemaRecipe>): ParselyRecipe;
  extractFromHtml(html: string): Array<WithContext<SchemaRecipe>>;
}

// Error handling
export class SchemaValidationError extends Error {
  constructor(
    message: string,
    public type: ChopErrorType,
    public details: Record<string, unknown>
  ) {
    super(message);
  }
}
```

#### Schema Processing Features

- Validation against Schema.org/Recipe specification
- Support for both JSON-LD and microdata formats
- Extraction of multiple recipes from a single page
- Detailed validation error reporting
- Type safety through schema-dts
- Raw schema preservation for debugging
  Create in `types/recipe.ts`:

```typescript
export interface Recipe {
  name: string;
  ingredients: string[];
  instructions: Array<{ text: string }>;
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
```

### 3. Configuration Management

Move from direct file operations to a Config Manager:

```typescript
export interface Config {
  notion: {
    auth: string;
    databaseId: string;
  };
  ai: {
    anthropicKey?: string;
    openaiKey?: string;
    defaultModel: "claude" | "gpt4";
  };
}

export class ConfigManager {
  static async load(): Promise<Config>;
  static async save(config: Config): Promise<void>;
  static validate(config: Config): boolean;
}
```

### 4. Command Implementations

#### Chop Command (Web Import)

```typescript
interface ChopOptions {
  urls: string[]; // Support multiple URLs
  input?: string; // Optional path to file containing URLs
  format?: "notion" | "json"; // Default to notion
  validateOnly?: boolean; // Just validate schema without importing
  batchSize?: number; // For rate limiting
}

interface SchemaValidationResult {
  url: string;
  valid: boolean;
  errors?: string[];
  rawSchema?: Record<string, unknown>;
}

interface ChopResult {
  successful: Array<{ url: string; recipeId: string }>;
  failed: Array<{ url: string; error: string }>;
  skipped: Array<{ url: string; reason: string }>;
}

async function executeChop(options: ChopOptions): Promise<ChopResult> {
  // Schema.org/Recipe validation and import
}

// Error types
enum ChopErrorType {
  NO_SCHEMA_FOUND = "NO_SCHEMA_FOUND",
  INVALID_SCHEMA = "INVALID_SCHEMA",
  FETCH_ERROR = "FETCH_ERROR",
  RATE_LIMITED = "RATE_LIMITED",
  PARSING_ERROR = "PARSING_ERROR",
}
```

Command supports:

- Single URL import: `parsely chop https://...`
- Multiple URLs: `parsely chop url1 url2 url3`
- Batch from file: `parsely chop --input urls.txt`
- Validation only: `parsely chop --validate url`
- Export raw schema: `parsely chop url --format json`

#### Scan Command (Photo Import)

```typescript
interface ScanOptions {
  files: string[];
  model: string;
  language: string;
  single: boolean;
}

async function executeScan(options: ScanOptions): Promise<void> {
  // Photo processing implementation
}
```

#### Plate Command (Schema Export)

```typescript
interface PlateOptions {
  input: string; // URL or file path
  format: "json" | "yaml" | "markdown";
  includeRaw?: boolean; // Include raw schema.org data
  pretty?: boolean; // Pretty print output
}

interface PlateResult {
  recipe: ParselyRecipe;
  rawSchema?: Record<string, unknown>;
  metadata: {
    source: string;
    extractedAt: string;
    schemaType: string;
  };
}

// Command supports:
// parsely plate recipe.json --format markdown
// parsely plate https://... --format json --include-raw
// parsely plate recipes/*.json --format yaml
```

The `plate` command focuses on schema.org/Recipe data manipulation:

- Extract and validate schema data without importing
- Convert between different formats
- Preserve raw schema data for debugging
- Batch convert multiple recipes
- Generate formatted output

## Development Priorities

1. Core Infrastructure

   - Configuration management
   - Type definitions
   - Command registration system

2. Command Migration

   - Move existing photo import functionality
   - Implement web scraping
   - Add export capabilities

3. Error Handling

   - Consistent error types
   - User-friendly error messages
   - Graceful failure modes

4. User Experience
   - Progress indicators
   - Interactive prompts
   - Validation feedback

## CLI Usage Examples

```bash
# Initialize configuration
parsely init

# Import from web
parsely chop https://cooking.nytimes.com/recipes/...

# Import from photo
parsely scan recipe.jpg
parsely scan --single recipe-p1.jpg recipe-p2.jpg

# Export to notion
# Export functionality automatically handled after import
```

## Testing Strategy

1. Unit Tests

   - Command logic
   - Config management
   - Type validation

2. Integration Tests

   - CLI workflow
   - Notion integration
   - File operations

3. E2E Tests
   - Complete user workflows
   - Error scenarios
   - Configuration handling

## Error Handling

### Schema Processing Errors

```typescript
export class SchemaError extends Error {
  constructor(
    public type: ChopErrorType,
    public url: string,
    public details: Record<string, unknown>
  ) {
    super(getErrorMessage(type, url, details));
  }
}

const errorMessages = {
  [ChopErrorType.NO_SCHEMA_FOUND]: `
No recipe schema found at {url}
Tip: Parsely only works with pages that include schema.org/Recipe data.
Try viewing the page source and looking for "application/ld+json" or "schema.org/Recipe"
  `,
  [ChopErrorType.INVALID_SCHEMA]: `
Invalid recipe schema at {url}
Details: {details}
  `,
  // ... more detailed error messages
};
```

### Batch Processing Errors

- Rate limiting handling
- Retry strategies
- Progress tracking
- Detailed error reporting
- Ability to resume failed batches

## Additional Features

1. Recipe Validation

   - Schema validation
   - Format normalization
   - Unit conversion

2. Web Scraping

   - Site-specific adapters
   - Rate limiting
   - Error recovery

3. Photo Processing

   - Image preprocessing
   - OCR optimization
   - Multi-page support

4. Export Options
   - Multiple formats
   - Template support
   - Batch operations

## Migration Steps

1. Create new directory structure
2. Move existing code to appropriate locations
3. Update imports and exports
4. Implement new command structure
5. Add type definitions
6. Update configuration management
7. Add error handling
8. Update tests
9. Document changes

## Code Style Guidelines

1. Use TypeScript features

   - Strong typing
   - Interfaces over types
   - Enums for constants

2. Error Handling

   - Custom error classes
   - Meaningful error messages
   - Proper async/await

3. Documentation

   - JSDoc comments
   - README updates
   - Usage examples

4. Testing
   - Jest for unit tests
   - Proper mocking
   - Test coverage

## Dependencies

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.17.1",
    "@notionhq/client": "^2.2.14",
    "chalk": "^5.3.0",
    "commander": "^12.0.0",
    "inquirer": "^9.2.15",
    "ora": "^8.0.1",
    "zod": "^3.22.4"
  }
}
```
