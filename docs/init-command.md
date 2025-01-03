# Init Command

The `init` command helps set up Parsely by configuring access to Notion and optional AI services.

## Usage

```bash
parsely init
```

## Configuration Options

The command will interactively prompt for:

| Option            | Description                                          | Required    |
| ----------------- | ---------------------------------------------------- | ----------- |
| Notion API Key    | Your Notion integration token                        | Yes         |
| Database Setup    | Create new or use existing database                  | Yes         |
| Database ID       | ID of existing Notion database (if not creating new) | Conditional |
| Anthropic API Key | API key for Claude AI model                          | No          |
| OpenAI API Key    | API key for GPT-4 model                              | No          |
| Default AI Model  | Choose between Claude or GPT-4                       | Yes         |

## Database Schema

When creating a new database, the following properties are configured:

- Name (title)
- URL (url)
- Cuisine Type (select)
  - Italian
  - Chinese
  - Japanese
  - (Customizable)
- Tags (multi-select)
  - Dinner
  - Quick
  - Vegetarian
  - (Customizable)
- Prep Time (number)
- Cook Time (number)
- Servings (rich text)

## Notes

- The Notion API key must have write permissions to create databases
- Database schema can be customized in Notion after creation
- Configuration is stored locally and can be updated by running init again
- AI keys are optional but required for photo recipe imports
