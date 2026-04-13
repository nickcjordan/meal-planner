export default function PlanLayout({ children }: { children: React.ReactNode }) {
  return <div className="h-[calc(100vh-3.5rem)] px-4 py-3 overflow-hidden">{children}</div>;
}
