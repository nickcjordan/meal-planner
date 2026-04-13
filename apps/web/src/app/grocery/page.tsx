import { GroceryListView } from "@/components/GroceryListView";

export default function GroceryPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-foreground">Grocery List</h1>
      <GroceryListView />
    </div>
  );
}
