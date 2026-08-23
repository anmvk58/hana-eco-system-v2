import { CheckCircle2, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export function ChangePasswordPage() {
  const { currentUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess(false);
    if (newPassword !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp");
      return;
    }
    setSaving(true);
    try {
      await api.auth.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể đổi mật khẩu");
    } finally {
      setSaving(false);
    }
  }

  return <div className="page-stack password-page">
    <section className="password-hero">
      <span><KeyRound size={28}/></span>
      <div><h2>Đổi mật khẩu</h2><p>Cập nhật mật khẩu cho tài khoản đang đăng nhập.</p></div>
    </section>
    <section className="password-layout">
      <form className="password-form" onSubmit={(event) => void submit(event)}>
        <header><div><h3>{currentUser?.display_name}</h3><p>Tài khoản: <strong>{currentUser?.username}</strong></p></div><LockKeyhole size={24}/></header>
        {error ? <div className="alert error">{error}</div> : null}
        {success ? <div className="alert success"><CheckCircle2 size={17}/>Đổi mật khẩu thành công. Các phiên đăng nhập khác đã được thu hồi.</div> : null}
        <label>Mật khẩu hiện tại<input required minLength={1} maxLength={128} type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)}/></label>
        <label>Mật khẩu mới<input required minLength={4} maxLength={128} type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)}/><small>Tối thiểu 4 ký tự và phải khác mật khẩu hiện tại.</small></label>
        <label>Xác nhận mật khẩu mới<input required minLength={4} maxLength={128} type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)}/></label>
        <div className="form-actions"><button className="primary-button" disabled={saving} type="submit"><KeyRound size={17}/>{saving ? "Đang đổi..." : "Đổi mật khẩu"}</button></div>
      </form>
      <aside className="password-security-note"><ShieldCheck size={25}/><div><h3>Bảo vệ tài khoản</h3><p>Sau khi đổi mật khẩu, phiên hiện tại vẫn được giữ để bạn tiếp tục làm việc. Những thiết bị khác đang đăng nhập bằng tài khoản này sẽ phải đăng nhập lại.</p></div></aside>
    </section>
  </div>;
}
