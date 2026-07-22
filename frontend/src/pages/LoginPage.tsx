import { LockKeyhole } from "lucide-react";
import { FormEvent, useState } from "react";

import { useAuth } from "../auth/AuthContext";

export function LoginPage() {
  const { login, error } = useAuth();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); setSubmitting(true);
    try { await login(username, password); } catch { /* Lỗi được hiển thị từ AuthContext. */ }
    finally { setSubmitting(false); }
  }

  return <main className="login-page"><section className="login-card">
    <div className="login-mark"><LockKeyhole size={30}/></div>
    <div><h1>Đăng nhập Hana POS</h1><p>Vui lòng đăng nhập trước khi thao tác trên hệ thống.</p></div>
    {error ? <div className="alert error">{error}</div> : null}
    <form onSubmit={event => void submit(event)}>
      <label>Tên đăng nhập<input autoFocus autoComplete="username" required value={username} onChange={event => setUsername(event.target.value)}/></label>
      <label>Mật khẩu<input autoComplete="current-password" required type="password" value={password} onChange={event => setPassword(event.target.value)}/></label>
      <button className="primary-button" disabled={submitting}>{submitting ? "Đang đăng nhập..." : "Đăng nhập"}</button>
    </form>
  </section></main>;
}
