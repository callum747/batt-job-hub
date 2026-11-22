import type { LucideIcon } from "lucide-react";

export function PageHeader({ title, intro, action }: { title: string; intro?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 md:mb-8">
      <div>
        <h1 className="text-[28px] font-semibold leading-tight md:text-[32px]">{title}</h1>
        {intro && <p className="mt-1 text-muted">{intro}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-surface px-6 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-bg text-blue">
        <Icon className="h-7 w-7" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-[20px] font-semibold">{title}</h2>
      <p className="mt-1 max-w-md text-muted">{text}</p>
    </div>
  );
}
