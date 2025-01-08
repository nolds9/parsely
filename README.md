# Parsely 🍃

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

### Chop

See docs in [docs/chop-command.md](docs/chop-command.md)

### Scan

See docs in [docs/scan-command.md](docs/scan-command.md)

### Plate

See docs in [docs/plate-command.md](docs/plate-command.md)

### Init

See docs in [docs/init-command.md](docs/init-command.md)
