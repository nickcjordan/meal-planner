export default function CookLayout({ children }: { children: React.ReactNode }) {
  // Narrow + focused on phone; widens on desktop to fit the two-column
  // ingredients/steps layout.
  return <div className="mx-auto w-full max-w-2xl px-4 py-4 lg:max-w-5xl lg:px-6">{children}</div>;
}
