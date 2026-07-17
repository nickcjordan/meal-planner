import { createSide, listSides } from "@meal-planner/db";
import type { CreateSideInput } from "@meal-planner/types";

const SEED_SIDES: CreateSideInput[] = [
  // --- Greens / Vegetables ---
  {
    name: "Steamed Broccoli",
    baseIngredient: "broccoli",
    prepStyle: "steamed",
    complexity: "simple",
    sideCategory: "green",
    tags: ["green-veg", "kid-friendly", "healthy"],
    pairingHints: ["grilled-protein", "roast"],
    prepNotes: "Steam broccoli crowns 4-5 min until bright green and tender-crisp. Toss with butter and salt.",
    ingredients: [
      { name: "broccoli crowns", quantity: 1, unit: "lb", category: "produce" },
      { name: "butter", quantity: 1, unit: "tbsp", category: "dairy" },
    ],
  },
  {
    name: "Broccoli with Soy Sauce",
    baseIngredient: "broccoli",
    prepStyle: "stir-fried",
    complexity: "simple",
    sideCategory: "green",
    tags: ["green-veg", "asian"],
    pairingHints: ["stir-fry", "asian"],
    prepNotes: "Sauté broccoli in sesame oil over medium-high 5 min. Add soy sauce, toss to coat.",
    ingredients: [
      { name: "broccoli crowns", quantity: 1, unit: "lb", category: "produce" },
      { name: "soy sauce", quantity: 1, unit: "tbsp", category: "condiments" },
      { name: "sesame oil", quantity: 1, unit: "tsp", category: "condiments" },
    ],
  },
  {
    name: "Broccoli Cheese Bake",
    baseIngredient: "broccoli",
    prepStyle: "baked casserole",
    complexity: "prepared",
    sideCategory: "green",
    tags: ["green-veg", "comfort-food", "kid-friendly"],
    pairingHints: ["roast", "grilled-protein"],
    prepNotes: "Blanch broccoli 2 min, mix with cheese sauce, top with breadcrumbs, bake 375°F 20 min.",
    ingredients: [
      { name: "broccoli crowns", quantity: 1, unit: "lb", category: "produce" },
      { name: "cheddar cheese", quantity: 1, unit: "cup", category: "dairy" },
      { name: "heavy cream", quantity: 0.5, unit: "cup", category: "dairy" },
      { name: "breadcrumbs", quantity: 0.25, unit: "cup", category: "pantry" },
    ],
  },
  {
    name: "Steamed Green Beans",
    baseIngredient: "green beans",
    prepStyle: "steamed",
    complexity: "simple",
    sideCategory: "green",
    tags: ["green-veg", "healthy"],
    pairingHints: ["roast", "grilled-protein"],
    prepNotes: "Steam green beans 5-6 min. Toss with butter, garlic, salt.",
    ingredients: [
      { name: "green beans", quantity: 0.75, unit: "lb", category: "produce" },
      { name: "butter", quantity: 1, unit: "tbsp", category: "dairy" },
      { name: "garlic", quantity: 1, unit: "clove", category: "produce" },
    ],
  },
  {
    name: "Roasted Asparagus",
    baseIngredient: "asparagus",
    prepStyle: "roasted",
    complexity: "simple",
    sideCategory: "green",
    tags: ["green-veg", "healthy"],
    pairingHints: ["grilled-protein", "seafood"],
    prepNotes: "Toss asparagus with olive oil, salt, pepper. Roast 400°F 12-15 min. Squeeze lemon.",
    ingredients: [
      { name: "asparagus", quantity: 1, unit: "bunch", category: "produce" },
      { name: "olive oil", quantity: 1, unit: "tbsp", category: "condiments" },
      { name: "lemon", quantity: 0.5, unit: "whole", category: "produce" },
    ],
  },
  {
    name: "Side Salad",
    baseIngredient: "mixed greens",
    prepStyle: "raw",
    complexity: "effortless",
    sideCategory: "salad",
    tags: ["salad", "healthy", "kid-friendly"],
    pairingHints: ["pizza", "pasta", "italian"],
    prepNotes: "Toss greens, tomatoes, cucumber in a bowl. Dress right before serving.",
    ingredients: [
      { name: "mixed greens", quantity: 4, unit: "cup", category: "produce" },
      { name: "cherry tomatoes", quantity: 0.5, unit: "cup", category: "produce" },
      { name: "cucumber", quantity: 0.5, unit: "whole", category: "produce" },
      { name: "salad dressing", quantity: 2, unit: "tbsp", category: "condiments" },
    ],
  },
  {
    name: "Roasted Vegetable Medley",
    baseIngredient: "mixed vegetables",
    prepStyle: "roasted",
    complexity: "prepared",
    sideCategory: "green",
    tags: ["healthy", "meal-prep"],
    pairingHints: ["roast", "grilled-protein"],
    prepNotes: "Toss veggies with olive oil, salt, Italian seasoning. Roast 425°F 25-30 min, stirring halfway.",
    ingredients: [
      { name: "zucchini", quantity: 1, unit: "whole", category: "produce" },
      { name: "bell pepper", quantity: 1, unit: "whole", category: "produce" },
      { name: "red onion", quantity: 0.5, unit: "whole", category: "produce" },
      { name: "olive oil", quantity: 2, unit: "tbsp", category: "condiments" },
    ],
  },
  {
    name: "Raw Veggie Sticks",
    baseIngredient: "carrots",
    prepStyle: "raw",
    complexity: "effortless",
    sideCategory: "green",
    tags: ["healthy", "kid-friendly", "snack"],
    prepNotes: "Cut carrots and celery into sticks. Serve with ranch or hummus.",
    ingredients: [
      { name: "carrots", quantity: 3, unit: "whole", category: "produce" },
      { name: "celery", quantity: 3, unit: "stalk", category: "produce" },
      { name: "ranch dressing", quantity: 0.25, unit: "cup", category: "condiments" },
    ],
  },

  // --- Starches / Grains ---
  {
    name: "White Rice",
    baseIngredient: "rice",
    prepStyle: "boiled",
    complexity: "simple",
    sideCategory: "starch",
    tags: ["starch", "versatile"],
    pairingHints: ["stir-fry", "asian", "mexican", "grilled-protein"],
    prepNotes: "Cook 2 cups rice with 2.5 cups water in rice cooker or covered pot.",
    ingredients: [
      { name: "long grain white rice", quantity: 2, unit: "cup", category: "pantry" },
    ],
  },
  {
    name: "Jasmine Rice",
    baseIngredient: "rice",
    prepStyle: "boiled",
    complexity: "simple",
    sideCategory: "starch",
    tags: ["starch", "asian"],
    pairingHints: ["stir-fry", "asian", "thai", "curry"],
    prepNotes: "Rinse until water runs clear. Cook 1:1.25 rice-to-water ratio in rice cooker.",
    ingredients: [
      { name: "jasmine rice", quantity: 2, unit: "cup", category: "pantry" },
    ],
  },
  {
    name: "Brown Rice",
    baseIngredient: "rice",
    prepStyle: "boiled",
    complexity: "simple",
    sideCategory: "grain",
    tags: ["grain", "healthy"],
    pairingHints: ["stir-fry", "grilled-protein", "bowl"],
    prepNotes: "Cook 2 cups brown rice with 3 cups water, 45 min on low with lid.",
    ingredients: [
      { name: "brown rice", quantity: 2, unit: "cup", category: "pantry" },
    ],
  },
  {
    name: "Rice Pilaf",
    baseIngredient: "rice",
    prepStyle: "pilaf",
    complexity: "prepared",
    sideCategory: "starch",
    tags: ["starch", "comfort-food"],
    pairingHints: ["roast", "grilled-protein", "mediterranean"],
    prepNotes: "Sauté onion in butter, add rice and toast 2 min, add broth, cover and cook 18 min.",
    ingredients: [
      { name: "long grain white rice", quantity: 1.5, unit: "cup", category: "pantry" },
      { name: "yellow onion", quantity: 0.5, unit: "whole", category: "produce" },
      { name: "chicken broth", quantity: 2.5, unit: "cup", category: "canned" },
      { name: "butter", quantity: 2, unit: "tbsp", category: "dairy" },
    ],
  },
  {
    name: "Buttered Egg Noodles",
    baseIngredient: "egg noodles",
    prepStyle: "boiled",
    complexity: "simple",
    sideCategory: "starch",
    tags: ["starch", "kid-friendly", "comfort-food"],
    pairingHints: ["roast", "hungarian", "german"],
    prepNotes: "Boil noodles per package. Drain, toss with butter, salt, pepper.",
    ingredients: [
      { name: "egg noodles", quantity: 8, unit: "oz", category: "pasta" },
      { name: "butter", quantity: 2, unit: "tbsp", category: "dairy" },
    ],
  },
  {
    name: "Mashed Potatoes",
    baseIngredient: "potatoes",
    prepStyle: "mashed",
    complexity: "prepared",
    sideCategory: "starch",
    tags: ["starch", "comfort-food", "kid-friendly"],
    pairingHints: ["roast", "grilled-protein", "american"],
    prepNotes: "Boil cubed potatoes 15-20 min until fork-tender. Mash with butter and milk. Season.",
    ingredients: [
      { name: "russet potatoes", quantity: 2, unit: "lb", category: "produce" },
      { name: "butter", quantity: 3, unit: "tbsp", category: "dairy" },
      { name: "milk", quantity: 0.5, unit: "cup", category: "dairy" },
    ],
  },
  {
    name: "Baked Potato",
    baseIngredient: "potatoes",
    prepStyle: "baked",
    complexity: "simple",
    sideCategory: "starch",
    tags: ["starch"],
    pairingHints: ["grilled-protein", "american"],
    prepNotes: "Poke potatoes with fork, bake 400°F 45-60 min. Split, fluff, add toppings.",
    ingredients: [
      { name: "russet potatoes", quantity: 4, unit: "whole", category: "produce" },
      { name: "butter", quantity: 2, unit: "tbsp", category: "dairy" },
      { name: "sour cream", quantity: 0.25, unit: "cup", category: "dairy" },
    ],
  },
  {
    name: "Couscous",
    baseIngredient: "couscous",
    prepStyle: "boiled",
    complexity: "simple",
    sideCategory: "grain",
    tags: ["grain", "quick"],
    pairingHints: ["mediterranean", "grilled-protein", "moroccan"],
    prepNotes: "Bring 1.5 cups broth to boil, stir in couscous, cover, remove from heat, fluff after 5 min.",
    ingredients: [
      { name: "couscous", quantity: 1, unit: "cup", category: "pasta" },
      { name: "chicken broth", quantity: 1.5, unit: "cup", category: "canned" },
    ],
  },

  // --- Bread / Other ---
  {
    name: "Garlic Bread",
    baseIngredient: "bread",
    prepStyle: "toasted",
    complexity: "simple",
    sideCategory: "bread",
    tags: ["bread", "comfort-food", "kid-friendly"],
    pairingHints: ["pasta", "italian", "soup"],
    prepNotes: "Split French bread, spread garlic butter, broil 2-3 min until golden.",
    ingredients: [
      { name: "French bread", quantity: 1, unit: "loaf", category: "bread" },
      { name: "butter", quantity: 3, unit: "tbsp", category: "dairy" },
      { name: "garlic", quantity: 3, unit: "clove", category: "produce" },
    ],
  },
  {
    name: "Dinner Rolls",
    baseIngredient: "rolls",
    prepStyle: "store-bought",
    complexity: "effortless",
    sideCategory: "bread",
    tags: ["bread", "kid-friendly"],
    pairingHints: ["roast", "soup", "american"],
    prepNotes: "Warm rolls in oven 5 min at 350°F. Serve with butter.",
    ingredients: [
      { name: "dinner rolls", quantity: 1, unit: "package", category: "bread" },
    ],
  },
  {
    name: "Cornbread",
    baseIngredient: "cornmeal",
    prepStyle: "baked",
    complexity: "prepared",
    sideCategory: "bread",
    tags: ["bread", "southern"],
    pairingHints: ["bbq", "chili", "soup", "southern"],
    prepNotes: "Mix wet and dry ingredients. Pour into greased 8x8 pan. Bake 400°F 20-25 min.",
    ingredients: [
      { name: "cornmeal", quantity: 1, unit: "cup", category: "pantry" },
      { name: "all-purpose flour", quantity: 1, unit: "cup", category: "pantry" },
      { name: "egg", quantity: 1, unit: "whole", category: "dairy" },
      { name: "buttermilk", quantity: 1, unit: "cup", category: "dairy" },
    ],
  },
  {
    name: "Black Beans",
    baseIngredient: "black beans",
    prepStyle: "heated",
    complexity: "simple",
    sideCategory: "legume",
    tags: ["legume", "healthy", "mexican"],
    pairingHints: ["mexican", "tex-mex", "rice-and-beans"],
    prepNotes: "Heat canned beans in pot with cumin, garlic powder. Squeeze lime before serving.",
    ingredients: [
      { name: "canned black beans", quantity: 1, unit: "can", category: "canned" },
      { name: "cumin", quantity: 0.5, unit: "tsp", category: "spices" },
      { name: "lime", quantity: 0.5, unit: "whole", category: "produce" },
    ],
  },
];

async function main() {
  const existing = await listSides();
  console.log(`Found ${existing.length} existing sides. Seeding ${SEED_SIDES.length} sides...`);

  const existingNames = new Set(existing.map((s) => s.name.toLowerCase()));
  let created = 0;
  let skipped = 0;

  for (const side of SEED_SIDES) {
    if (existingNames.has(side.name.toLowerCase())) {
      console.log(`  Skipping "${side.name}" (already exists)`);
      skipped++;
      continue;
    }

    await createSide(side);
    console.log(`  Created "${side.name}" (${side.sideCategory} / ${side.complexity})`);
    created++;
  }

  console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
