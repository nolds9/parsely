# Parsely CLI - Product Requirements Document

## Overview

Parsely is a command-line interface tool for importing recipes from various sources (web, photos) and exporting them to Notion databases. The project needs to be refactored from its current state into a more modular, maintainable structure with clear separation of concerns.

## Project Structure

Convert the current flat structure into:

```
parsely/
├── src/
│   ├── commands/           # Command implementations
│   │   ├── chop.ts        # Web scraping (NYT, etc.)
│   │   ├── scan.ts        # Photo processing
│   │   ├── serve.ts       # Export to Notion
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
  - `export` → `serve`
  - Keep `init` as is

### 2. Type Definitions

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
  url: string;
  tags?: string[];
}

async function executeChop(options: ChopOptions): Promise<void> {
  // Web scraping implementation
}
```

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

#### Serve Command (Export)

```typescript
interface ServeOptions {
  recipe: Recipe;
  destination: "notion";
  tags?: string[];
}

async function executeServe(options: ServeOptions): Promise<void> {
  // Export implementation
}
```

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
parsely serve recipe.json --to notion
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
    "@anthropic-ai/sdk": "^0.33.1",
    "@notionhq/client": "^2.2.15",
    "chalk": "^5.4.1",
    "commander": "^13.0.0",
    "inquirer": "^12.3.0",
    "ora": "^8.1.1",
    "zod": "^3.24.1"
  }
}
```
