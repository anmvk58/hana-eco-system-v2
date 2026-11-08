import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

const openModals: symbol[] = [];

export function Modal({
  title,
  children,
  onClose,
  className = "",
  submitOnEnter = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  submitOnEnter?: boolean;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const modalId = Symbol("modal");
    const panel = panelRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openModals.push(modalId);
    // Move keyboard events off the opener, which may stop propagation.
    // Preserve autofocus on inputs already focused inside the dialog.
    if (panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing || event.repeat) return;
      if (openModals[openModals.length - 1] !== modalId) return;
      // Consume Escape even if the caller blocks closing while saving.
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      const index = openModals.indexOf(modalId);
      if (index !== -1) openModals.splice(index, 1);
      document.removeEventListener("keydown", closeOnEscape);
      if (previousFocus?.isConnected && (panel?.contains(document.activeElement) || document.activeElement === document.body)) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, []);

  useEffect(() => {
    if (!submitOnEnter) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter" || event.defaultPrevented || event.isComposing || event.repeat || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
      const panel = panelRef.current;
      const dialogs = document.querySelectorAll('[role="dialog"]');
      // Only the topmost dialog may confirm, including when a transfer dialog is open.
      if (!panel || dialogs[dialogs.length - 1] !== panel) return;
      const target = event.target;
      if (target instanceof Element && target.closest('textarea, select, button, a, [contenteditable="true"], .payment-note-settings')) return;
      const form = panel.querySelector("form");
      const submitButton = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (!form || !submitButton) return;
      event.preventDefault();
      if (!submitButton.disabled) form.requestSubmit(submitButton);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [submitOnEnter]);

  return (
    <div className="modal-backdrop" role="presentation">
      <section ref={panelRef} tabIndex={-1} className={`modal-panel${className ? ` ${className}` : ""}`} role="dialog" aria-modal="true" aria-label={title}>
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

