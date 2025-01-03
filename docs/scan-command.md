# Scan Command

The `scan` command imports recipes from photos into Notion. It supports both single and multi-page recipes.

## Usage

```bash
parsely scan [options] <files...>
```

### Single photo

```bash
parsely scan recipe.jpg
```

### Multiple photos as separate recipes

```bash
parsely scan recipe1.jpg recipe2.jpg recipe3.jpg
```

### Multiple photos as one recipe (multi-page)

```bash
parsely scan --single page1.jpg page2.jpg page3.jpg
```

### Specify language and model

```bash
parsely scan --language french --model gpt4 recipe.jpg
```

## Options

| Option                      | Description                                | Default   |
| --------------------------- | ------------------------------------------ | --------- |
| `-m, --model <model>`       | AI model to use (claude/gpt4)              | `claude`  |
| `-l, --language <language>` | Source language of the recipe              | `english` |
| `-s, --single`              | Treat multiple photos as a single recipe   | `false`   |
| `-r, --retries <number>`    | Number of retry attempts for AI processing | `3`       |
| `--debug`                   | Enable detailed debug logging              | `false`   |
| `--no-spinner`              | Disable progress spinner                   | `false`   |

## Supported Image Formats

- JPEG (.jpg, .jpeg)
- PNG (.png)

## Features

### Multi-page Recipe Support

When using the `--single` flag, multiple photos are processed together as one recipe, ideal for multi-page recipes:

```bash
parsely scan --single page1.jpg page2.jpg page3.jpg
```

### Batch Processing

Process multiple photos as separate recipes:

```bash
parsely scan 1.jpg 2.jpg 3.jpg
```

### Language Support

Specify the source language for better recognition:

```bash
parsely scan --language french recipe.jpg
```

### AI Model Selection

Choose between Claude (default) or GPT-4:

```bash
parsely scan --model gpt4 recipe.jpg
```

### Retry Logic

Automatic retry for failed AI processing:

```bash
parsely scan --retries 5 recipe.jpg
```

## Processing Flow

1. Image validation (format check)
2. AI processing of photo(s)
3. Recipe review prompt
4. Notion import
5. Photo
