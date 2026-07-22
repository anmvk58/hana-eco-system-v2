import { CheckCircle2, X } from "lucide-react";
import { useEffect } from "react";

export function ToastNotification({
  message,
  onClose,
  duration = 2500,
}: {
  message: string;
  onClose: () => void;
  duration?: number;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, duration);
    return () => window.clearTimeout(timer);
  }, [duration, message, onClose]);

  return (
    <div className="toast-notification" role="status" aria-live="polite">
      <div className="toast-icon"><CheckCircle2 size={21} /></div>
      <div className="toast-content">
        <strong>Tạo hóa đơn thành công</strong>
        <span>{message}</span>
      </div>
      <button type="button" onClick={onClose} aria-label="Đóng thông báo">
        <X size={17} />
      </button>
      <span className="toast-progress" style={{ animationDuration: `${duration}ms` }} />
    </div>
  );
}
