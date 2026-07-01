import React, { useState } from 'react';
import { KeyRound, Save } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import BrandMark from './BrandMark';

function ChangePassword() {
  const { changeOwnPassword, user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('As senhas novas nao coincidem.');
      return;
    }

    setIsSubmitting(true);

    try {
      await changeOwnPassword({ currentPassword, newPassword });
    } catch (changeError) {
      setError(changeError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="change-password-title">
        <BrandMark className="auth-brand" />

        <form className="auth-form" onSubmit={handleSubmit}>
          <div>
            <h1 id="change-password-title">Trocar senha</h1>
            <p>{user?.nome_completo || user?.nome_usuario || 'Usuario'}</p>
          </div>

          {error ? <p className="form-error" role="alert">{error}</p> : null}

          <label className="auth-field">
            <span>Senha atual ou temporaria</span>
            <div>
              <KeyRound size={20} />
              <input
                autoComplete="current-password"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
            </div>
          </label>

          <label className="auth-field">
            <span>Nova senha</span>
            <div>
              <KeyRound size={20} />
              <input
                autoComplete="new-password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
              />
            </div>
          </label>

          <label className="auth-field">
            <span>Confirmar nova senha</span>
            <div>
              <KeyRound size={20} />
              <input
                autoComplete="new-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </div>
          </label>

          <button className="primary-button auth-submit" type="submit" disabled={isSubmitting}>
            <Save size={18} />
            {isSubmitting ? 'A guardar...' : 'Guardar nova senha'}
          </button>
        </form>
      </section>
    </main>
  );
}

export default ChangePassword;
