import { Inbox } from "lucide-react";

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="empty-state">
      <Inbox size={32} />
      <strong>{title}</strong>
      {description ? <span>{description}</span> : null}
    </div>
  );
}

