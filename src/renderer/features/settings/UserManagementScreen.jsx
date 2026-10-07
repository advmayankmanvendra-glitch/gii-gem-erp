import React, { useEffect, useState } from "react";
import { EmptyState } from "../../components/common.jsx";
import { Field, FormActions, FormRow, FormSection, SelectField, StatusBadge } from "../../components/forms/index.jsx";

const ROLE_LABELS = {
  super_admin: "Super Admin",
  admin: "Admin",
  accountant: "Accountant",
  manager: "Manager",
  data_entry_operator: "Data Entry Operator",
  viewer: "Viewer"
};

const ROLE_NOTES = {
  super_admin: "Everything, including managing other Super Admins.",
  admin: "All posting, approval, year-end, backup/restore and user management.",
  accountant: "Create, edit, post and reverse entries; imports, exports and reports.",
  manager: "Create, edit and approve; exports and reports. Cannot post.",
  data_entry_operator: "Create and edit records and run imports. Cannot post or approve.",
  viewer: "Read reports and export. Cannot change data."
};

const EMPTY_NEW_USER = { username: "", display_name: "", role: "data_entry_operator", password: "" };

function roleLabel(role) {
  return ROLE_LABELS[role] || role || "-";
}

export function UserManagementScreen({ notify, apiClient, session, confirmAction }) {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState(Object.keys(ROLE_LABELS));
  const [loading, setLoading] = useState(false);
  const [newUser, setNewUser] = useState(EMPTY_NEW_USER);
  const [editing, setEditing] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPassword, setResetPassword] = useState("");
  const [accessDenied, setAccessDenied] = useState("");

  async function refresh() {
    setLoading(true);
    try {
      const result = await apiClient.listUsers();
      setUsers(Array.isArray(result?.users) ? result.users : []);
      if (Array.isArray(result?.roles) && result.roles.length) setRoles(result.roles);
      setAccessDenied("");
    } catch (error) {
      if (/Permission denied/i.test(error.message || "")) {
        setAccessDenied(error.message);
        return;
      }
      notify(error.message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const roleOptions = roles.map((role) => [role, roleLabel(role)]);

  if (accessDenied) {
    return (
      <section className="panel settings-panel user-management-panel">
        <EmptyState title="User Management is limited to administrators" note="Your role cannot view or change ERP users. Ask an Admin to create users, change roles or reset passwords for you." />
      </section>
    );
  }

  async function submitNewUser(event) {
    event.preventDefault();
    try {
      const created = await apiClient.createUser(newUser);
      notify(`User ${created.username} created. They must change the temporary password at first login.`);
      setNewUser(EMPTY_NEW_USER);
      refresh();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function saveEdit(event) {
    event.preventDefault();
    try {
      await apiClient.updateUser(editing.id, { display_name: editing.display_name, role: editing.role, status: editing.status });
      notify(`User ${editing.username} updated.`);
      setEditing(null);
      refresh();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function submitReset(event) {
    event.preventDefault();
    const decision = confirmAction
      ? await confirmAction({ mode: "warning", title: "Reset Password", message: `${resetTarget.username} will have to change this temporary password at next login. Any lockout is cleared.`, confirmLabel: "Yes, Reset", cancelLabel: "No, Cancel", moduleName: "user_management", recordId: resetTarget.id })
      : { confirmed: true };
    if (!decision?.confirmed) return;
    try {
      await apiClient.resetUserPassword(resetTarget.id, resetPassword);
      notify(`Password reset for ${resetTarget.username}. Share the temporary password with them privately.`);
      setResetTarget(null);
      setResetPassword("");
      refresh();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  return (
    <section className="panel settings-panel user-management-panel">
      <div className="panel-head">
        <div>
          <h2>User Management</h2>
          <p>Create ERP users, assign roles, deactivate leavers and reset forgotten passwords. Every change is written to the audit log.</p>
        </div>
        <button type="button" className="secondary-btn" onClick={refresh} disabled={loading}>{loading ? "Refreshing..." : "Refresh"}</button>
      </div>

      <div className="table-wrap">
        {users.length ? (
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Name</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Password</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.username}{Number(user.id) === Number(session?.id) ? " (you)" : ""}</td>
                  <td>{user.display_name}</td>
                  <td>{roleLabel(user.role)}</td>
                  <td><StatusBadge status={user.status === "active" ? "Active" : "Inactive"} /></td>
                  <td>{user.last_login_at || "Never"}</td>
                  <td>{user.locked_until ? "Locked" : user.force_password_change ? "Change pending" : "Set"}</td>
                  <td>
                    <div className="button-row">
                      <button type="button" className="secondary-btn" onClick={() => { setResetTarget(null); setEditing({ ...user }); }}>Edit</button>
                      <button type="button" className="secondary-btn" onClick={() => { setEditing(null); setResetTarget(user); setResetPassword(""); }}>Reset Password</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState title={loading ? "Loading users" : "No users found"} note="Use Refresh to reload the user list." />
        )}
      </div>

      {editing && (
        <form onSubmit={saveEdit}>
          <FormSection title={`Edit ${editing.username}`} note={ROLE_NOTES[editing.role] || ""}>
            <FormRow className="form-grid">
              <Field label="Display Name" type="text" value={editing.display_name} onChange={(value) => setEditing({ ...editing, display_name: value })} />
              <SelectField label="Role" value={editing.role} options={roleOptions} onChange={(value) => setEditing({ ...editing, role: value })} />
              <Field label="Status" type="status" value={editing.status} onChange={(value) => setEditing({ ...editing, status: value })} />
            </FormRow>
            <FormActions>
              <button type="submit" className="primary-btn">Save Changes</button>
              <button type="button" className="secondary-btn" onClick={() => setEditing(null)}>Cancel</button>
            </FormActions>
          </FormSection>
        </form>
      )}

      {resetTarget && (
        <form onSubmit={submitReset}>
          <FormSection title={`Reset password for ${resetTarget.username}`} note="Use at least 8 characters with uppercase, lowercase and a number. The user must change it at next login.">
            <FormRow className="form-grid">
              <Field label="Temporary Password" type="password" value={resetPassword} onChange={setResetPassword} />
            </FormRow>
            <FormActions>
              <button type="submit" className="primary-btn" disabled={!resetPassword}>Reset Password</button>
              <button type="button" className="secondary-btn" onClick={() => setResetTarget(null)}>Cancel</button>
            </FormActions>
          </FormSection>
        </form>
      )}

      <form onSubmit={submitNewUser}>
        <FormSection title="Add User" note={ROLE_NOTES[newUser.role] || ""}>
          <FormRow className="form-grid">
            <Field label="Username" type="text" value={newUser.username} onChange={(value) => setNewUser({ ...newUser, username: value })} />
            <Field label="Display Name" type="text" value={newUser.display_name} onChange={(value) => setNewUser({ ...newUser, display_name: value })} />
            <SelectField label="Role" value={newUser.role} options={roleOptions} onChange={(value) => setNewUser({ ...newUser, role: value })} />
            <Field label="Temporary Password" type="password" value={newUser.password} onChange={(value) => setNewUser({ ...newUser, password: value })} />
          </FormRow>
          <FormActions>
            <button type="submit" className="primary-btn" disabled={!newUser.username || !newUser.display_name || !newUser.password}>Create User</button>
          </FormActions>
        </FormSection>
      </form>
    </section>
  );
}
