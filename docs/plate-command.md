# Plate Command

The `plate` command converts recipes between different formats and allows for schema validation and manipulation.

## Usage

### Basic Usage

Convert a recipe file to JSON:

```bash
parsely plate recipe.txt --format json
```

### Options

| Option          | Alias | Description                          | Default |
| --------------- | ----- | ------------------------------------ | ------- |
| `--format`      | `-f`  | Output format (json\|yaml\|markdown) | `json`  |
| `--include-raw` | `-r`  | Include raw schema.org data          | `false` |
| `--pretty`      | `-p`  | Pretty print output                  | `false` |

### Supported Formats

- **JSON**: Standard JSON format
- **YAML**: YAML format with recipe data
- **Markdown**: Human-readable markdown with sections

### Examples

Convert a recipe to pretty-printed JSON:

```bash
parsely plate recipe.txt --format json --pretty
```

Export a web recipe to markdown:

```bash
parsely plate https://cooking.nytimes.com/recipes/... --format markdown`
```

Include raw schema data in YAML format:

```bash
parsely plate recipe.json --format yaml --include-raw
```

### Error Handling

The command will fail with appropriate error messages in these cases:

- Invalid input file format
- Unsupported output format
- Network errors when fetching URLs
- Invalid recipe schema

### Notes

- When processing URLs, the command will attempt to extract recipe data using Schema.org metadata
- The `--include-raw` option is useful for debugging schema extraction
- Markdown output is optimized for readability and compatibility with most markdown viewers
