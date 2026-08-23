import { Edit2, KeyRound, Plus, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import type { Permission, Role, RolePayload, User, UserPayload } from "../types";

const emptyRole: RolePayload = { name: "", description: "", permission_codes: [] };
const emptyUser: UserPayload = { username: "", display_name: "", password: "", is_active: true, role_ids: [] };

export function AccessControlPage() {
  const { hasPermission, refresh: refreshAuth, currentUser } = useAuth();
  const [tab, setTab] = useState<"users" | "roles">("users");
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [roleForm, setRoleForm] = useState<RolePayload>(emptyRole);
  const [userForm, setUserForm] = useState<UserPayload>(emptyUser);
  const [roleModal, setRoleModal] = useState(false);
  const [userModal, setUserModal] = useState(false);
  const [resettingUser, setResettingUser] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordConfirmation, setResetPasswordConfirmation] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const [userData, roleData, permissionData] = await Promise.all([api.access.users(), api.access.roles(), api.access.permissions()]);
      setUsers(userData); setRoles(roleData); setPermissions(permissionData);
    } catch (err) { setError(err instanceof Error ? err.message : "Không tải được dữ liệu phân quyền"); }
  }
  useEffect(() => { void load(); }, []);

  const permissionGroups = useMemo(() => permissions.reduce<Record<string, Permission[]>>((groups, permission) => {
    (groups[permission.module] ??= []).push(permission); return groups;
  }, {}), [permissions]);

  function openRole(role?: Role) {
    setEditingRole(role ?? null);
    setRoleForm(role ? { name: role.name, description: role.description ?? "", permission_codes: role.permissions.map((item) => item.code) } : emptyRole);
    setRoleModal(true);
  }
  function openUser(user?: User) {
    setEditingUser(user ?? null);
    setUserForm(user ? { username: user.username, display_name: user.display_name, password: "", is_active: user.is_active, role_ids: user.roles.map((role) => role.id) } : emptyUser);
    setUserModal(true);
  }
  async function submitRole(event: FormEvent) {
    event.preventDefault(); setError("");
    try {
      if (editingRole) await api.access.updateRole(editingRole.id, roleForm); else await api.access.createRole(roleForm);
      setRoleModal(false); await load(); await refreshAuth();
    } catch (err) { setError(err instanceof Error ? err.message : "Không lưu được role"); }
  }
  async function submitUser(event: FormEvent) {
    event.preventDefault(); setError("");
    try {
      if (editingUser) {
        const { password: _password, ...payload } = userForm;
        await api.access.updateUser(editingUser.id, payload);
      } else {
        await api.access.createUser(userForm);
      }
      setUserModal(false); await load(); await refreshAuth();
    } catch (err) { setError(err instanceof Error ? err.message : "Không lưu được người dùng"); }
  }
  function openResetPassword(user: User) {
    setResettingUser(user);
    setResetPassword("");
    setResetPasswordConfirmation("");
    setResetError("");
  }
  async function submitResetPassword(event: FormEvent) {
    event.preventDefault();
    if (!resettingUser) return;
    setResetError("");
    if (resetPassword !== resetPasswordConfirmation) {
      setResetError("Mật khẩu xác nhận không khớp");
      return;
    }
    setResetting(true);
    try {
      await api.access.resetUserPassword(resettingUser.id, resetPassword);
      setResettingUser(null);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Không thể reset mật khẩu");
    } finally {
      setResetting(false);
    }
  }
  async function removeRole(role: Role) {
    if (!confirm(`Xóa role ${role.name}?`)) return;
    try { await api.access.removeRole(role.id); await load(); } catch (err) { setError(err instanceof Error ? err.message : "Không xóa được role"); }
  }
  async function removeUser(user: User) {
    if (!confirm(`Khóa người dùng ${user.display_name}?`)) return;
    try { await api.access.removeUser(user.id); await load(); await refreshAuth(); } catch (err) { setError(err instanceof Error ? err.message : "Không khóa được người dùng"); }
  }

  return <div className="page-stack">
    <section className="toolbar access-tabs">
      <button className={tab === "users" ? "primary-button" : "secondary-button"} onClick={() => setTab("users")}><UserRound size={17}/>Người dùng</button>
      <button className={tab === "roles" ? "primary-button" : "secondary-button"} onClick={() => setTab("roles")}><ShieldCheck size={17}/>Role & quyền</button>
      <span className="toolbar-spacer" />
      {tab === "users" && hasPermission("users.create") ? <button className="primary-button" onClick={() => openUser()}><Plus size={17}/>Thêm người dùng</button> : null}
      {tab === "roles" && hasPermission("roles.create") ? <button className="primary-button" onClick={() => openRole()}><Plus size={17}/>Thêm role</button> : null}
    </section>
    {error ? <div className="alert error">{error}</div> : null}

    {tab === "users" ? <section className="table-panel"><table className="data-table"><thead><tr><th>Tài khoản</th><th>Tên hiển thị</th><th>Role</th><th>Trạng thái</th><th></th></tr></thead><tbody>{users.map(user => <tr key={user.id}><td className="code-cell">{user.username}</td><td>{user.display_name}</td><td><div className="tag-list">{user.roles.map(role => <span className="role-tag" key={role.id}>{role.name}</span>)}</div></td><td>{user.is_active ? "Hoạt động" : "Đã khóa"}</td><td className="row-actions">{hasPermission("users.reset_password") && user.id !== currentUser?.id ? <button className="icon-button" onClick={() => openResetPassword(user)} aria-label={`Reset mật khẩu ${user.username}`} title="Reset mật khẩu"><KeyRound size={16}/></button> : null}{hasPermission("users.update") ? <button className="icon-button" onClick={() => openUser(user)} aria-label="Sửa"><Edit2 size={16}/></button> : null}{hasPermission("users.delete") && user.id !== currentUser?.id && user.is_active ? <button className="icon-button danger" onClick={() => void removeUser(user)} aria-label="Khóa"><Trash2 size={16}/></button> : null}</td></tr>)}</tbody></table>{users.length === 0 ? <EmptyState title="Chưa có người dùng"/> : null}</section>
    : <section className="table-panel"><table className="data-table"><thead><tr><th>Role</th><th>Mô tả</th><th>Số quyền</th><th></th></tr></thead><tbody>{roles.map(role => <tr key={role.id}><td className="code-cell">{role.name}{role.is_system ? " (hệ thống)" : ""}</td><td>{role.description}</td><td>{role.permissions.length}</td><td className="row-actions">{hasPermission("roles.update") && !role.is_system ? <button className="icon-button" onClick={() => openRole(role)} aria-label="Sửa"><Edit2 size={16}/></button> : null}{hasPermission("roles.delete") && !role.is_system ? <button className="icon-button danger" onClick={() => void removeRole(role)} aria-label="Xóa"><Trash2 size={16}/></button> : null}</td></tr>)}</tbody></table>{roles.length === 0 ? <EmptyState title="Chưa có role"/> : null}</section>}

    {roleModal ? <Modal title={editingRole ? "Cập nhật role" : "Thêm role"} onClose={() => setRoleModal(false)}><form className="form-grid" onSubmit={event => void submitRole(event)}><label>Tên role<input required value={roleForm.name} onChange={event => setRoleForm({...roleForm, name: event.target.value})}/></label><label>Mô tả<input value={roleForm.description} onChange={event => setRoleForm({...roleForm, description: event.target.value})}/></label><div className="permission-matrix span-2">{Object.entries(permissionGroups).map(([module, items]) => <fieldset key={module}><legend>{module}</legend>{items.map(permission => <label className="permission-option" key={permission.code}><input type="checkbox" checked={roleForm.permission_codes.includes(permission.code)} onChange={event => setRoleForm({...roleForm, permission_codes: event.target.checked ? [...roleForm.permission_codes, permission.code] : roleForm.permission_codes.filter(code => code !== permission.code)})}/><span>{permission.name}</span></label>)}</fieldset>)}</div><div className="form-actions span-2"><button type="button" className="secondary-button" onClick={() => setRoleModal(false)}>Hủy</button><button className="primary-button">Lưu role</button></div></form></Modal> : null}

    {userModal ? <Modal title={editingUser ? "Cập nhật người dùng" : "Thêm người dùng"} onClose={() => setUserModal(false)}><form className="form-grid" onSubmit={event => void submitUser(event)}><label>Tên đăng nhập<input required pattern="[A-Za-z0-9._-]+" value={userForm.username} onChange={event => setUserForm({...userForm, username: event.target.value})}/></label><label>Tên hiển thị<input required value={userForm.display_name} onChange={event => setUserForm({...userForm, display_name: event.target.value})}/></label>{!editingUser ? <label className="span-2">Mật khẩu<input required minLength={4} maxLength={128} type="password" autoComplete="new-password" value={userForm.password ?? ""} onChange={event => setUserForm({...userForm, password: event.target.value})} placeholder="Tối thiểu 4 ký tự"/></label> : null}<label className="span-2">Role<select multiple value={userForm.role_ids.map(String)} onChange={event => setUserForm({...userForm, role_ids: Array.from(event.target.selectedOptions, option => Number(option.value))})}>{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select><span className="field-hint">Giữ Ctrl/Cmd để chọn nhiều role.</span></label><label className="permission-option span-2"><input type="checkbox" checked={userForm.is_active} onChange={event => setUserForm({...userForm, is_active: event.target.checked})}/><span>Người dùng đang hoạt động</span></label><div className="form-actions span-2"><button type="button" className="secondary-button" onClick={() => setUserModal(false)}>Hủy</button><button className="primary-button">Lưu người dùng</button></div></form></Modal> : null}

    {resettingUser ? <Modal title="Reset mật khẩu người dùng" className="password-reset-modal" onClose={() => !resetting && setResettingUser(null)}><form className="page-stack password-reset-form" onSubmit={(event) => void submitResetPassword(event)}><div className="password-reset-user"><span><KeyRound size={22}/></span><div><small>Tài khoản cần reset</small><strong>{resettingUser.display_name}</strong><p>{resettingUser.username}</p></div></div>{resetError ? <div className="alert error">{resetError}</div> : null}<label>Mật khẩu mới<input required minLength={4} maxLength={128} type="password" autoComplete="new-password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)}/><small>Tối thiểu 4 ký tự.</small></label><label>Xác nhận mật khẩu mới<input required minLength={4} maxLength={128} type="password" autoComplete="new-password" value={resetPasswordConfirmation} onChange={(event) => setResetPasswordConfirmation(event.target.value)}/></label><div className="alert warning">Sau khi reset, toàn bộ phiên đăng nhập hiện tại của người dùng này sẽ bị thu hồi.</div><div className="form-actions"><button type="button" className="secondary-button" disabled={resetting} onClick={() => setResettingUser(null)}>Hủy</button><button className="primary-button" disabled={resetting} type="submit"><KeyRound size={16}/>{resetting ? "Đang reset..." : "Xác nhận reset"}</button></div></form></Modal> : null}
  </div>;
}
