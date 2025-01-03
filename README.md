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

Export to Notion:

```bash
parsely serve recipe.json --to notion
```
