# Photo / Screenshot Recipe Import Workflow

Extract recipes from photos of recipe cards, cookbook pages, or screenshots using Claude's vision capabilities, then import them into the meal planner via JSON import.

## Workflow

### 1. Prepare your images

Gather recipe photos — handwritten cards, cookbook pages, screenshots from websites, etc. Supported formats: JPG, PNG, WebP.

### 2. Extract with Claude

Open Claude Code or Claude.ai Desktop and use this prompt with your image(s):

```
Extract the recipe from this image into the following JSON format. Be precise with quantities and measurements. If something is unclear, make your best guess and note it in the description.

{
  "name": "Recipe Name",
  "description": "Brief description of the dish",
  "ingredients": [
    { "name": "ingredient name", "quantity": 2, "unit": "cup", "category": "produce" }
  ],
  "steps": [
    "Step 1 description",
    "Step 2 description"
  ],
  "cookTime": 30,
  "prepTime": 15,
  "servings": 4,
  "tags": ["cuisine-type", "protein", "other-tags"],
  "categories": ["dinner"],
  "complexity": "standard"
}

Rules:
- quantity must be a number (convert fractions: 1/2 = 0.5, 1/4 = 0.25)
- unit should be standardized: cup, tbsp, tsp, oz, lb, g, ml, clove, can, piece
- category should be one of: produce, meat, seafood, dairy, pantry, spices, canned, frozen, bakery, condiments, other
- complexity: "staple" (< 5 ingredients, very simple), "standard" (typical recipe), "involved" (many ingredients or complex steps)
- cookTime and prepTime are in minutes
- tags should include cuisine type (italian, mexican, etc.), main protein, and other descriptors
- categories: typically "dinner", could also include "lunch", "breakfast", "dessert", "side"

If multiple recipes are in the image, output a JSON array of recipe objects.
```

### 3. Import the JSON

1. Copy the JSON output from Claude
2. Go to the meal planner app -> Recipes -> Import -> JSON Import
3. Paste the JSON and click Import
4. The app validates each recipe, stores any images to S3, and saves to the database

### Tips

- **Multiple images**: You can attach several images in one Claude conversation and ask it to extract all recipes into a single JSON array.
- **Handwriting**: Claude handles handwritten recipes well. If it can't read something, it will note the uncertainty.
- **Cookbook pages**: For cookbook photos, make sure the full ingredient list and instructions are visible.
- **Batch processing**: Extract several recipes in one Claude session, copy the full JSON array, and import all at once.

### Example

Given a photo of a handwritten recipe card for "Mom's Chicken Soup", Claude might output:

```json
[
  {
    "name": "Mom's Chicken Soup",
    "description": "Classic comfort food chicken soup with egg noodles",
    "ingredients": [
      { "name": "chicken breast", "quantity": 2, "unit": "lb", "category": "meat" },
      { "name": "carrots", "quantity": 3, "unit": "piece", "category": "produce" },
      { "name": "celery stalks", "quantity": 3, "unit": "piece", "category": "produce" },
      { "name": "onion", "quantity": 1, "unit": "piece", "category": "produce" },
      { "name": "chicken broth", "quantity": 8, "unit": "cup", "category": "canned" },
      { "name": "egg noodles", "quantity": 8, "unit": "oz", "category": "pantry" },
      { "name": "salt", "quantity": 1, "unit": "tsp", "category": "spices" },
      { "name": "pepper", "quantity": 0.5, "unit": "tsp", "category": "spices" },
      { "name": "dried thyme", "quantity": 0.5, "unit": "tsp", "category": "spices" }
    ],
    "steps": [
      "Place chicken breasts in a large pot with broth. Bring to a boil, then reduce heat and simmer for 20 minutes until cooked through.",
      "Remove chicken and shred with two forks. Set aside.",
      "Add diced carrots, celery, and onion to the broth. Simmer for 10 minutes.",
      "Add egg noodles and cook for 8 minutes until tender.",
      "Return shredded chicken to the pot. Season with salt, pepper, and thyme.",
      "Simmer for 5 more minutes and serve hot."
    ],
    "cookTime": 45,
    "prepTime": 15,
    "servings": 6,
    "tags": ["soup", "chicken", "comfort-food", "american"],
    "categories": ["dinner"],
    "complexity": "standard"
  }
]
```

Paste this into the JSON Import form in the app, and the recipe is saved.
