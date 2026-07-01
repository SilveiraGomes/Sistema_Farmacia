import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Binary,
  CheckCircle2,
  KeyRound,
  Pencil,
  PlusCircle,
  RefreshCcw,
  ShieldCheck,
  ShieldX,
  UserRound,
  UsersRound,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { request } from '../services/ipcClient.js';
import { confirmDelete, confirmSensitiveAction } from '../utils/confirmations.mjs';
import PinPad from './PinPad.jsx';

const EMPTY_FORM = {
  nome_completo: '',
  nome_usuario: '',
  email: '',
  cargo: '',
  perfil_id: '',
};

function Usuarios() {
  const { hasPermission, reloadSession, user: currentUser } = useAuth();
  const canCreate = hasPermission('usuarios.criar');
  const canEdit = hasPermission('usuarios.editar');
  const canDeactivate = hasPermission('usuarios.inativar');
  const canResetPassword = hasPermission('usuarios.resetar_senha');
  const canManagePermissions = hasPermission('usuarios.gerir_permissoes');

  const [users, setUsers] = useState([]);
  const [profileSummaries, setProfileSummaries] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState(null);
  const [userModal, setUserModal] = useState({ mode: null, user: null });
  const [form, setForm] = useState(EMPTY_FORM);
  const [permissionsModalOpen, setPermissionsModalOpen] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [selectedPermissionKeys, setSelectedPermissionKeys] = useState([]);
  const [pinModal, setPinModal] = useState(null); // { user } | null
  const [pinValue, setPinValue] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinStep, setPinStep] = useState('enter'); // 'enter' | 'confirm'
  const [pinError, setPinError] = useState('');

  const loadUsersAndSummaries = useCallback(async () => {
    setError('');
    const [nextUsers, nextProfileSummaries] = await Promise.all([
      request('users.list'),
      request('profiles.summaries'),
    ]);
    setUsers(Array.isArray(nextUsers) ? nextUsers : []);
    setProfileSummaries(Array.isArray(nextProfileSummaries) ? nextProfileSummaries : []);
  }, []);

  const loadPermissionData = useCallback(async () => {
    if (!canManagePermissions) {
      setProfiles([]);
      setPermissions([]);
      return;
    }

    const [nextProfiles, nextPermissions] = await Promise.all([
      request('profiles.list'),
      request('profiles.permissions'),
    ]);
    setProfiles(Array.isArray(nextProfiles) ? nextProfiles : []);
    setPermissions(Array.isArray(nextPermissions) ? nextPermissions : []);
  }, [canManagePermissions]);

  const loadInitialData = useCallback(async () => {
    setIsLoading(true);
    try {
      await loadUsersAndSummaries();
      await loadPermissionData();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }, [loadPermissionData, loadUsersAndSummaries]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    if (!canManagePermissions) {
      setPermissionsModalOpen(false);
    }
  }, [canManagePermissions]);

  useEffect(() => {
    if (!profiles.length) {
      setSelectedProfileId('');
      setSelectedPermissionKeys([]);
      return;
    }

    const currentProfile = profiles.find((profile) => String(profile.id) === String(selectedProfileId));
    const nextProfile = currentProfile || profiles[0];
    setSelectedProfileId(String(nextProfile.id));
    setSelectedPermissionKeys(nextProfile.permissoes || []);
  }, [profiles, selectedProfileId]);

  const metrics = useMemo(() => {
    const activeUsers = users.filter((user) => user.ativo !== false).length;
    const administrators = users.filter((user) => user.perfil?.nome === 'Administrador').length;
    return {
      activeUsers,
      administrators,
      totalUsers: users.length,
      profilesCount: profileSummaries.length,
    };
  }, [profileSummaries.length, users]);

  const permissionsByModule = useMemo(() => {
    return permissions.reduce((groups, permission) => {
      const moduleName = permission.modulo || 'Outros';
      if (!groups[moduleName]) {
        groups[moduleName] = [];
      }
      groups[moduleName].push(permission);
      return groups;
    }, {});
  }, [permissions]);

  const hasActiveModal = Boolean(userModal.mode || permissionsModalOpen);

  function isCurrentUser(user) {
    return Boolean(currentUser?.id && user?.id && currentUser.id === user.id);
  }

  function openCreateModal() {
    if (isSubmitting) {
      return;
    }

    setError('');
    setForm(EMPTY_FORM);
    setUserModal({ mode: 'create', user: null });
  }

  function openEditModal(user) {
    if (isSubmitting) {
      return;
    }

    setError('');
    setForm({
      nome_completo: user.nome_completo || '',
      nome_usuario: user.nome_usuario || '',
      email: user.email || '',
      cargo: user.cargo || '',
      perfil_id: user.perfil_id ? String(user.perfil_id) : '',
    });
    setUserModal({ mode: 'edit', user });
  }

  function closeUserModal() {
    setError('');
    setUserModal({ mode: null, user: null });
    setForm(EMPTY_FORM);
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function openPinModal(user) {
    setPinModal({ user });
    setPinValue('');
    setPinConfirm('');
    setPinStep('enter');
    setPinError('');
    setError('');
  }

  function closePinModal() {
    setPinModal(null);
    setPinValue('');
    setPinConfirm('');
    setPinStep('enter');
    setPinError('');
  }

  // submittedPin comes from PinPad's onSubmit(next) — bypasses stale state on auto-submit
  // Must be a string of 4 digits; anything else (e.g. DOM event) falls back to state
  async function handlePinModalSubmit(submittedPin) {
    const pinArg = typeof submittedPin === 'string' ? submittedPin : null;
    if (pinStep === 'enter') {
      const enterPin = pinArg ?? pinValue;
      if (enterPin.length !== 4) { setPinError('Introduza 4 dígitos.'); return; }
      setPinValue(enterPin);
      setPinConfirm('');
      setPinStep('confirm');
      setPinError('');
      return;
    }
    // confirm step — use submittedPin to avoid reading stale pinConfirm state
    const confirmPin = pinArg ?? pinConfirm;
    if (confirmPin !== pinValue) { setPinError('Os PINs não coincidem. Tente novamente.'); setPinConfirm(''); return; }
    setIsSubmitting(true);
    setPinError('');
    try {
      await request('users.setPin', { userId: pinModal.user.id, pin: pinValue });
      setUsers((prev) => prev.map((u) => u.id === pinModal.user.id ? { ...u, has_pin: true } : u));
      closePinModal();
    } catch (e) {
      setPinError(e.message || 'Erro ao definir PIN.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleClearPin(user) {
    if (!(await confirmSensitiveAction(`Remover o PIN de ${user.nome_completo || user.nome_usuario}?`))) return;
    setIsSubmitting(true);
    try {
      await request('users.clearPin', { userId: user.id });
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, has_pin: false } : u));
    } catch (e) {
      setError(e.message || 'Erro ao remover PIN.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function buildUserPayload() {
    return {
      nome_completo: form.nome_completo.trim(),
      nome_usuario: form.nome_usuario.trim(),
      email: form.email.trim(),
      cargo: form.cargo.trim(),
      perfil_id: form.perfil_id === '' ? null : Number(form.perfil_id),
    };
  }

  async function handleUserSubmit(event) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const payload = buildUserPayload();
      if (userModal.mode === 'create') {
        const result = await request('users.create', payload);
        setTemporaryPassword({
          title: 'Senha temporaria criada',
          username: result?.user?.nome_usuario || payload.nome_usuario,
          password: result?.temporaryPassword,
        });
      } else if (userModal.user) {
        await request('users.update', {
          id: userModal.user.id,
          ...payload,
        });
        if (isCurrentUser(userModal.user)) {
          await reloadSession();
        }
      }

      closeUserModal();
      await loadUsersAndSummaries();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function toggleUserStatus(user) {
    if (isSubmitting) {
      return;
    }

    if (user.ativo !== false && !(await confirmDelete(`o usuario ${user.nome_completo || user.nome_usuario}`))) {
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const action = user.ativo === false ? 'users.activate' : 'users.deactivate';
      await request(action, { id: user.id });
      if (isCurrentUser(user)) {
        await reloadSession();
      }
      await loadUsersAndSummaries();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function resetPassword(user) {
    if (isSubmitting) {
      return;
    }

    if (!(await confirmSensitiveAction(`Deseja redefinir a senha do usuario ${user.nome_completo || user.nome_usuario}?`))) {
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const result = await request('users.resetPassword', { id: user.id });
      setTemporaryPassword({
        title: 'Senha temporaria redefinida',
        username: result?.user?.nome_usuario || user.nome_usuario,
        password: result?.temporaryPassword,
      });
      if (isCurrentUser(user)) {
        await reloadSession();
      }
      await loadUsersAndSummaries();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function openPermissionsModal() {
    if (isSubmitting) {
      return;
    }

    setError('');
    try {
      if (!profiles.length || !permissions.length) {
        await loadPermissionData();
      }
      setPermissionsModalOpen(true);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  function chooseProfile(profileId) {
    const profile = profiles.find((item) => String(item.id) === String(profileId));
    setSelectedProfileId(String(profileId));
    setSelectedPermissionKeys(profile?.permissoes || []);
  }

  function togglePermission(permissionKey) {
    setSelectedPermissionKeys((current) => (
      current.includes(permissionKey)
        ? current.filter((key) => key !== permissionKey)
        : [...current, permissionKey].sort()
    ));
  }

  async function savePermissions() {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const nextProfiles = await request('profiles.updatePermissions', {
        profileId: Number(selectedProfileId),
        permissionKeys: selectedPermissionKeys,
      });
      setProfiles(Array.isArray(nextProfiles) ? nextProfiles : []);
      await reloadSession();
      setPermissionsModalOpen(false);
      await loadUsersAndSummaries();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="standard-screen users-screen">
      <div className="standard-metrics">
        <Metric title="Usuarios Activos" value={metrics.activeUsers} icon={UsersRound} />
        <Metric title="Administradores" value={metrics.administrators} icon={ShieldCheck} />
        <Metric title="Total de Usuarios" value={metrics.totalUsers} icon={UserRound} />
        <Metric title="Perfis" value={metrics.profilesCount} icon={KeyRound} />
      </div>

      {error && !hasActiveModal ? <p className="form-error" role="alert">{error}</p> : null}

      {temporaryPassword?.password ? (
        <div className="temporary-password-panel" role="alert">
          <div>
            <strong>{temporaryPassword.title}</strong>
            <span>{temporaryPassword.username}: <b>{temporaryPassword.password}</b></span>
          </div>
          <button type="button" className="icon-button" aria-label="Limpar senha temporaria" onClick={() => setTemporaryPassword(null)}>
            <XCircle size={18} />
          </button>
        </div>
      ) : null}

      <div className="panel table-panel">
        <div className="panel-title-row">
          <h2>Usuarios do Sistema</h2>
          <div className="stock-toolbar-actions">
            {canCreate ? (
              <button type="button" onClick={openCreateModal} disabled={isSubmitting}>
                <PlusCircle size={17} /> Novo Usuario
              </button>
            ) : null}
            {canManagePermissions ? (
              <button type="button" onClick={openPermissionsModal} disabled={isSubmitting}>
                <ShieldCheck size={17} /> Permissoes
              </button>
            ) : null}
            <button type="button" onClick={loadInitialData} disabled={isLoading || isSubmitting} aria-label="Atualizar usuarios">
              <RefreshCcw size={17} /> Atualizar
            </button>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Nome Completo</th>
              <th>Nome de Usuario</th>
              <th>Perfil</th>
              <th>Email</th>
              <th>Status</th>
              <th>Ultimo Login</th>
              <th>Opcoes</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.nome_completo || '-'}</td>
                <td>{user.nome_usuario || '-'}</td>
                <td>{user.perfil?.nome || '-'}</td>
                <td>{user.email || '-'}</td>
                <td>
                  <span className={user.ativo === false ? 'status waiting' : 'status paid'}>
                    {user.ativo === false ? 'Inactivo' : 'Activo'}
                  </span>
                </td>
                <td>{formatDateTime(user.ultimo_login_em)}</td>
                <td className="options-cell">
                  {canEdit ? (
                    <button className="icon-button" type="button" aria-label="Editar usuario" onClick={() => openEditModal(user)} disabled={isSubmitting}>
                      <Pencil size={16} />
                    </button>
                  ) : null}
                  {(user.ativo === false ? canEdit : canDeactivate) ? (
                    <button
                      className={user.ativo === false ? 'icon-button' : 'icon-button danger'}
                      type="button"
                      aria-label={user.ativo === false ? 'Activar usuario' : 'Inativar usuario'}
                      onClick={() => toggleUserStatus(user)}
                      disabled={isSubmitting}
                    >
                      {user.ativo === false ? <CheckCircle2 size={16} /> : <ShieldX size={16} />}
                    </button>
                  ) : null}
                  {canResetPassword ? (
                    <button className="icon-button" type="button" aria-label="Redefinir senha" onClick={() => resetPassword(user)} disabled={isSubmitting}>
                      <KeyRound size={16} />
                    </button>
                  ) : null}
                  {canEdit ? (
                    <button
                      className={`icon-button${user.has_pin ? ' danger' : ''}`}
                      type="button"
                      aria-label={user.has_pin ? 'Remover PIN' : 'Definir PIN'}
                      title={user.has_pin ? 'Remover PIN' : 'Definir PIN'}
                      onClick={() => user.has_pin ? handleClearPin(user) : openPinModal(user)}
                      disabled={isSubmitting}
                    >
                      <Binary size={16} />
                    </button>
                  ) : null}
                  {!canEdit && !canDeactivate && !canResetPassword ? <span className="muted-cell">-</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {isLoading ? (
          <div className="empty-state">
            <UsersRound size={28} />
            <strong>A carregar usuarios</strong>
          </div>
        ) : null}

        {!isLoading && !users.length ? (
          <div className="empty-state">
            <UserRound size={28} />
            <strong>Nenhum usuario encontrado</strong>
          </div>
        ) : null}
      </div>

      {userModal.mode ? (
        <UserFormModal
          mode={userModal.mode}
          form={form}
          profiles={profileSummaries}
          isSubmitting={isSubmitting}
          error={error}
          onChange={updateForm}
          onClose={closeUserModal}
          onSubmit={handleUserSubmit}
        />
      ) : null}

      {permissionsModalOpen && canManagePermissions ? (
        <PermissionsModal
          profiles={profiles}
          permissionsByModule={permissionsByModule}
          selectedProfileId={selectedProfileId}
          selectedPermissionKeys={selectedPermissionKeys}
          isSubmitting={isSubmitting}
          error={error}
          onProfileChange={chooseProfile}
          onTogglePermission={togglePermission}
          onClose={() => {
            setError('');
            setPermissionsModalOpen(false);
          }}
          onSave={savePermissions}
        />
      ) : null}

      {pinModal ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ maxWidth: 340 }}>
            <div className="modal-title-row">
              <h2>
                {pinStep === 'enter' ? 'Definir PIN' : 'Confirmar PIN'} —{' '}
                {pinModal.user.nome_completo || pinModal.user.nome_usuario}
              </h2>
              <button type="button" onClick={closePinModal}>×</button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '0 0 8px', textAlign: 'center' }}>
              {pinStep === 'enter'
                ? 'Introduza o novo PIN de 4 dígitos.'
                : 'Repita o PIN para confirmar.'}
            </p>

            <PinPad
              value={pinStep === 'enter' ? pinValue : pinConfirm}
              onChange={(v) => {
                setPinError('');
                pinStep === 'enter' ? setPinValue(v) : setPinConfirm(v);
              }}
              onSubmit={(fullPin) => handlePinModalSubmit(fullPin)}
              disabled={isSubmitting}
              error={pinError}
            />

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button type="button" className="secondary-button" style={{ flex: 1 }} onClick={closePinModal}>
                Cancelar
              </button>
              <button
                type="button"
                className="primary-button"
                style={{ flex: 1 }}
                disabled={isSubmitting || (pinStep === 'enter' ? pinValue.length !== 4 : pinConfirm.length !== 4)}
                onClick={handlePinModalSubmit}
              >
                {pinStep === 'enter' ? 'Continuar' : isSubmitting ? 'A guardar…' : 'Guardar PIN'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function UserFormModal({ mode, form, profiles, isSubmitting, error, onChange, onClose, onSubmit }) {
  const isEdit = mode === 'edit';
  const errorId = 'user-form-error';

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-describedby={error ? errorId : undefined}>
      <form className="modal-card wide" onSubmit={onSubmit}>
        <div className="modal-title-row">
          <h2>{isEdit ? 'Editar Usuario' : 'Novo Usuario'}</h2>
          <button type="button" onClick={onClose}>x</button>
        </div>
        {error ? <p className="form-error" id={errorId} role="alert">{error}</p> : null}
        <div className="form-grid">
          <input
            placeholder="Nome completo"
            value={form.nome_completo}
            onChange={(event) => onChange('nome_completo', event.target.value)}
            required
          />
          <input
            placeholder="Nome de usuario"
            value={form.nome_usuario}
            onChange={(event) => onChange('nome_usuario', event.target.value)}
            required
            disabled={isEdit}
          />
          <input
            placeholder="Email"
            type="email"
            value={form.email}
            onChange={(event) => onChange('email', event.target.value)}
          />
          <input
            placeholder="Cargo"
            value={form.cargo}
            onChange={(event) => onChange('cargo', event.target.value)}
          />
          <select
            value={form.perfil_id}
            onChange={(event) => onChange('perfil_id', event.target.value)}
          >
            <option value="">Sem perfil</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.nome}</option>
            ))}
          </select>
        </div>
        <div className="modal-actions">
          <button type="button" className="soft-button" onClick={onClose} disabled={isSubmitting}>Cancelar</button>
          <button type="submit" className="primary-button" disabled={isSubmitting}>
            {isSubmitting ? 'A guardar...' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  );
}

function PermissionsModal({
  profiles,
  permissionsByModule,
  selectedProfileId,
  selectedPermissionKeys,
  isSubmitting,
  error,
  onProfileChange,
  onTogglePermission,
  onClose,
  onSave,
}) {
  const selectedProfile = profiles.find((profile) => String(profile.id) === String(selectedProfileId));
  const errorId = 'permissions-form-error';

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-describedby={error ? errorId : undefined}>
      <div className="modal-card permissions-modal">
        <div className="modal-title-row">
          <h2>Permissoes por Perfil</h2>
          <button type="button" onClick={onClose}>x</button>
        </div>
        {error ? <p className="form-error" id={errorId} role="alert">{error}</p> : null}

        <div className="permissions-layout">
          <aside className="profile-list" aria-label="Perfis">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                className={String(profile.id) === String(selectedProfileId) ? 'active' : ''}
                onClick={() => onProfileChange(profile.id)}
                disabled={isSubmitting}
              >
                <strong>{profile.nome}</strong>
                <span>{profile.descricao || 'Sem descricao'}</span>
              </button>
            ))}
          </aside>

          <div className="permissions-editor">
            <div className="permissions-editor-header">
              <div>
                <strong>{selectedProfile?.nome || 'Perfil'}</strong>
                <span>{selectedPermissionKeys.length} permissoes selecionadas</span>
              </div>
            </div>

            <div className="permissions-grid">
              {Object.entries(permissionsByModule).map(([moduleName, modulePermissions]) => (
                <section key={moduleName} className="permission-group">
                  <h3>{moduleName}</h3>
                  {modulePermissions.map((permission) => (
                    <label key={permission.chave} className="permission-check">
                      <input
                        type="checkbox"
                        checked={selectedPermissionKeys.includes(permission.chave)}
                        onChange={() => onTogglePermission(permission.chave)}
                        disabled={isSubmitting}
                      />
                      <span>
                        <strong>{permission.descricao || permission.chave}</strong>
                        <small>{permission.chave}</small>
                      </span>
                    </label>
                  ))}
                </section>
              ))}
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="soft-button" onClick={onClose} disabled={isSubmitting}>Cancelar</button>
          <button type="button" className="primary-button" onClick={onSave} disabled={isSubmitting || !selectedProfileId}>
            {isSubmitting ? 'A guardar...' : 'Guardar Permissoes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Metric({ title, value, icon: Icon }) {
  return (
    <div className="standard-metric blue">
      <span><Icon size={32} /></span>
      <div>
        <h2>{title}</h2>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat('pt-AO', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

export default Usuarios;
