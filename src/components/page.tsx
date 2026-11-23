import type { LucideIcon } from "lucide-react";

export function PageHeader({ title, intro, action }: { title: string; intro?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 md:mb-7">
      <div className="min-w-0">
        <h1 className="headline text-[24px] md:text-[28px]">{title}</h1>
        {intro && <p className="mt-1.5 text-[15px] text-muted">{intro}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line-strong bg-bg px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-soft text-blue-deep">
        <Icon className="h-7 w-7" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-[17px] font-semibold">{title}</h2>
      <p className="mt-1 max-w-md text-[15px] text-muted">{text}</p>
    </div>
  );
}
