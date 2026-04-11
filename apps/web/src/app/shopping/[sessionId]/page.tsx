import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ShoppingListView } from "@/components/ShoppingListView";

export default async function ShoppingPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  return (
    <div>
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-foreground">Shopping List</h1>
      <ShoppingListView sessionId={sessionId} />
    </div>
  );
}
