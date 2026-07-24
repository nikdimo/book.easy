import { LucideIcon, SearchX } from "lucide-react";
import type { Resolved } from "@/lib/i18n/t";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string | Resolved;
  description?: string | Resolved;
  children?: React.ReactNode;
}

export function EmptyState({
  icon: Icon = SearchX,
  title,
  description,
  children,
}: EmptyStateProps) {
  const resolvedTitle = typeof title === "string" ? { text: title, translated: false } : title;
  const resolvedDescription = typeof description === "string"
    ? { text: description, translated: false }
    : description;
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon className="h-12 w-12 text-muted-foreground/50 mb-4" />
      <h3 className={resolvedTitle.translated ? "notranslate text-lg font-semibold mb-1" : "text-lg font-semibold mb-1"}>{resolvedTitle.text}</h3>
      {resolvedDescription && (
        <p className={resolvedDescription.translated ? "notranslate text-sm text-muted-foreground max-w-md mb-4" : "text-sm text-muted-foreground max-w-md mb-4"}>{resolvedDescription.text}</p>
      )}
      {children}
    </div>
  );
}
