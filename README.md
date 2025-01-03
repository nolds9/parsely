# Parsely

A CLI tool for importing recipes to Notion. Supports web scraping and photo imports.

## Installation

```bash
npm install -g parsely-cli
```

## Usage

Initialize Notion configuration:

```bash
parsely init
```

Import a recipe from the web:

```bash
parsely chop https://cooking.nytimes.com/...
```

Import a recipe from a photo:

```bash
parsely scan recipe.jpg
```

## Commands

Import a recipe or recipes from a url, multiple urls, or from a file.

### Chop

#### Single URL

`parsely chop https://example.com/recipe`

#### Multiple URLs from file

`parsely chop --input recipes.txt`

#### Validate only

`parsely chop --validate-only https://example.com/recipe`

#### Batch processing with custom size

`parsely chop --input recipes.txt --batch-size 10`

#### With tags

`parsely chop https://example.com/recipe --tags "dinner" "quick"`
