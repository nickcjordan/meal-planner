export default function PlanLayout({ children }: { children: React.ReactNode }) {
  // Desktop (lg+): a fixed viewport-height pane with internal panel scrolling.
  // Below lg: natural document flow so the stacked columns can scroll the page
  // instead of clipping inside an overflow-hidden box.
  return (
    <div className="px-4 py-3 lg:h-[calc(100vh-3.5rem)] lg:overflow-hidden">
      {children}
    </div>
  );
}
