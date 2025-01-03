### Chop

Import a recipe or recipes from a url, multiple urls, or from a file.

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
