import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, LockKeyhole, LogIn, UserRound } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { request } from '../services/ipcClient.js';
import BrandMark from './BrandMark';

const PASSWORD_FOCUS_DELAYS = [0, 80, 250, 600];

function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('admin');
  const [loginUsers, setLoginUsers] = useState([]);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const passwordInputRef = useRef(null);

  function focusPasswordField() {
    window.focus?.();
    PASSWORD_FOCUS_DELAYS.forEach((delay) => {
      window.setTimeout(() => {
        passwordInputRef.current?.focus({ preventScroll: true });
      }, delay);
    });
  }

  useEffect(() => {
    let isMounted = true;

    async function loadLoginUsers() {
      setIsLoadingUsers(true);

      try {
        const users = await request('auth.loginUsers');
        if (!isMounted) {
          return;
        }

        const nextUsers = Array.isArray(users) ? users : [];
        setLoginUsers(nextUsers);
        setUsername((current) => current || nextUsers[0]?.nome_usuario || '');
      } catch {
        if (isMounted) {
          setLoginUsers([{ id: 'admin', nome_usuario: 'admin', nome_completo: 'Administrador' }]);
          setUsername((current) => current || 'admin');
        }
      } finally {
        if (isMounted) {
          setIsLoadingUsers(false);
        }
      }
    }

    loadLoginUsers();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (isLoadingUsers) {
      return undefined;
    }

    function refocusPasswordField() {
      focusPasswordField();
    }

    function refocusWhenVisible() {
      if (!document.hidden) {
        focusPasswordField();
      }
    }

    focusPasswordField();
    window.addEventListener('focus', refocusPasswordField);
    document.addEventListener('visibilitychange', refocusWhenVisible);

    return () => {
      window.removeEventListener('focus', refocusPasswordField);
      document.removeEventListener('visibilitychange', refocusWhenVisible);
    };
  }, [isLoadingUsers]);

  function handleUsernameChange(event) {
    setUsername(event.target.value);
    setPassword('');
    setError('');
    setIsPasswordVisible(false);
    focusPasswordField();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await login({ username: username.trim(), password });
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="login-title">
        <BrandMark className="auth-brand" />

        <form className="auth-form" onSubmit={handleSubmit}>
          <div>
            <h1 id="login-title">Entrar</h1>
            <p>Acesse o sistema com as suas credenciais.</p>
          </div>

          {error ? <p className="form-error" role="alert">{error}</p> : null}

          <label className="auth-field">
            <span>Usuario</span>
            <div>
              <UserRound size={20} />
              <select
                autoComplete="username"
                value={username}
                onChange={handleUsernameChange}
                disabled={isLoadingUsers || isSubmitting}
                required
              >
                {loginUsers.map((user) => (
                  <option key={user.id} value={user.nome_usuario}>
                    {user.nome_completo || user.nome_usuario}
                  </option>
                ))}
              </select>
            </div>
          </label>

          <label className="auth-field">
            <span>Senha</span>
            <div>
              <LockKeyhole size={20} />
              <input
                autoComplete="current-password"
                autoFocus
                ref={passwordInputRef}
                type={isPasswordVisible ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                type="button"
                className="auth-password-toggle"
                aria-label={isPasswordVisible ? 'Ocultar senha' : 'Mostrar senha'}
                onClick={() => setIsPasswordVisible((current) => !current)}
              >
                {isPasswordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          <button className="primary-button auth-submit" type="submit" disabled={isSubmitting || isLoadingUsers}>
            <LogIn size={18} />
            {isSubmitting ? 'A entrar...' : 'Entrar'}
          </button>
        </form>
      </section>
    </main>
  );
}

export default Login;
