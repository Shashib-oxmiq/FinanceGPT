export function PageHeader({ title, subtitle, actions, testid }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-8" data-testid={testid}>
      <div>
        <h1 className="font-heading text-3xl md:text-4xl font-black tracking-tight">{title}</h1>
        {subtitle && <p className="text-muted-foreground text-sm mt-1 max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Page({ children }) {
  return <div className="p-6 md:p-10 max-w-7xl mx-auto animate-fade-up">{children}</div>;
}
