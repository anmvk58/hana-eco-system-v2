import { X } from "lucide-react";
import type { ReactNode } from "react";

export function Modal({
  title,
  children,
  onClose,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className={`modal-panel${className ? ` ${className}` : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Đóng">
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

