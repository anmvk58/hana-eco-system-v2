import { CheckCircle2, CircleAlert, X, XCircle } from "lucide-react";
import { useEffect } from "react";

export function ToastNotification({
  message,
  title = "Tạo hóa đơn thành công",
  variant = "success",
  onClose,
  duration = 2500,
}: {
  message: string;
  title?: string;
  variant?: "success" | "warning" | "error";
  onClose: () => void;
  duration?: number;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, duration);
    return () => window.clearTimeout(timer);
  }, [duration, message, onClose]);

  return (
    <div className={`toast-notification ${variant}`} role={variant === "error" ? "alert" : "status"} aria-live="polite">
      <div className="toast-icon">{variant === "warning" ? <CircleAlert size={21} /> : variant === "error" ? <XCircle size={21} /> : <CheckCircle2 size={21} />}</div>
      <div className="toast-content">
        <strong>{title}</strong>
        <span>{message}</span>
      </div>
      <button type="button" onClick={onClose} aria-label="Đóng thông báo">
        <X size={17} />
      </button>
      <span className="toast-progress" style={{ animationDuration: `${duration}ms` }} />
    </div>
  );
}
