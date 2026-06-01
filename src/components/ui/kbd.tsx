import { cn } from "@/lib/utils";

export function Kbd({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded border border-border bg-secondary text-[10px] font-mono font-medium text-muted-foreground",
        className
      )}
    >
      {children}
    </kbd>
  );
}
