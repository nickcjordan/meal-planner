import { PageHeader } from "@/components/ui";
import { GroceryListView } from "@/components/GroceryListView";

export default function GroceryPage() {
  return (
    <div>
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Grocery List" className="mb-6" />
      </div>
      <GroceryListView />
    </div>
  );
}
