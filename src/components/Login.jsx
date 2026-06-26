import React, { useEffect, useRef, useState } from "react";
import { Binary, Eye, EyeOff, LockKeyhole, LogIn, UserRound, Users } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { request } from "../services/ipcClient.js";
import BrandMark from "./BrandMark";
import PinPad from "./PinPad";

const PASSWORD_FOCUS_DELAYS = [0, 80, 250, 600];

function getInitials(name) {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

function Login() {
  const { login, applySession } = useAuth();

  // ── Shared state ──
  const [loginUsers, setLoginUsers] = useState([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [mode, setMode] = useState("password"); // "password" | "pin"

  // ── Password mode ──
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const passwordInputRef = useRef(null);

  // ── PIN mode ──
  const [pinUsers, setPinUsers] = useState([]);
  const [selectedPinUser, setSelectedPinUser] = useState(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinSubmitting, setPinSubmitting] = useState(false);

  function focusPasswordField() {
    window.focus?.();
    PASSWORD_FOCUS_DELAYS.forEach((delay) => {
      window.setTimeout(() => passwordInputRef.current?.focus({ preventScroll: true }), delay);
    });
  }

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setIsLoadingUsers(true);
      try {
        const [users, withPin] = await Promise.all([
          request("auth.loginUsers"),
          request("auth.usersWithPin").catch(() => []),
        ]);
        if (!isMounted) return;
        const nextUsers = Array.isArray(users) ? users : [];
        setLoginUsers(nextUsers);
        setUsername((c) => c || nextUsers[0]?.nome_usuario || "");
        setPinUsers(Array.isArray(withPin) ? withPin : []);
      } catch {
        if (isMounted) {
          setLoginUsers([{ id: "admin", nome_usuario: "admin", nome_completo: "Administrador" }]);
          setUsername((c) => c || "admin");
        }
      } finally {
        if (isMounted) setIsLoadingUsers(false);
      }
    }
    load();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    if (isLoadingUsers || mode !== "password") return;
    const focus = () => focusPasswordField();
    const onVisible = () => { if (!document.hidden) focusPasswordField(); };
    focusPasswordField();
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isLoadingUsers, mode]);

  // ── Password submit ──
  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    if (!username?.trim()) { setError("Selecione um utilizador."); setIsSubmitting(false); return; }
    if (!password.trim()) { setError("A palavra-passe é obrigatória."); setIsSubmitting(false); return; }
    try {
      await login({ username: username.trim(), password });
    } catch (e) {
      setError(e.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── PIN submit ──
  async function handlePinSubmit(fullPin) {
    if (!selectedPinUser || fullPin.length !== 4) return;
    setPinError("");
    setPinSubmitting(true);
    try {
      const session = await request("auth.loginWithPin", { userId: selectedPinUser.id, pin: fullPin });
      applySession(session);
    } catch (e) {
      setPinError(e.message || "PIN inválido.");
      setPin("");
    } finally {
      setPinSubmitting(false);
    }
  }

  function switchMode(next) {
    setMode(next);
    setError("");
    setPinError("");
    setPin("");
    setSelectedPinUser(null);
  }

  // ── Render PIN mode ──
  if (mode === "pin") {
    return (
      <main className="auth-screen">
        <section className="pin-login-card" aria-labelledby="login-title">
          <BrandMark className="auth-brand" />

          {selectedPinUser ? (
            /* ── PIN keypad ── */
            <div className="pin-login-keypad">
              <div className="pin-login-identity">
                <div className="pin-login-avatar">
                  {getInitials(selectedPinUser.nome_completo)}
                </div>
                <div className="pin-login-name">{selectedPinUser.nome_completo || selectedPinUser.nome_usuario}</div>
                <div className="pin-login-hint">Introduza o seu PIN</div>
              </div>

              <PinPad
                value={pin}
                onChange={(v) => { setPin(v); if (pinError) setPinError(""); }}
                onSubmit={handlePinSubmit}
                disabled={pinSubmitting}
                error={pinSubmitting ? "A verificar…" : pinError}
              />

              <div className="pin-footer-actions">
                <button type="button" className="pin-icon-btn" title="Outro utilizador"
                  onClick={() => { setSelectedPinUser(null); setPin(""); setPinError(""); }}>
                  <Users size={20} />
                </button>
                <button type="button" className="pin-icon-btn" title="Entrar com senha"
                  onClick={() => switchMode("password")}>
                  <LockKeyhole size={20} />
                </button>
              </div>
            </div>
          ) : (
            /* ── User picker ── */
            <div className="pin-login-picker">
              <div className="pin-login-header">
                <Binary size={40} />
                <h1 id="login-title">Acesso Rápido</h1>
                <p>Selecione o utilizador</p>
              </div>

              {pinUsers.length === 0 ? (
                <p className="pin-login-empty">Nenhum utilizador tem PIN configurado.</p>
              ) : (
                <div className="pin-user-grid">
                  {pinUsers.map((u) => (
                    <button key={u.id} type="button" className="pin-user-card"
                      onClick={() => { setSelectedPinUser(u); setPin(""); setPinError(""); }}>
                      <span className="pin-user-avatar">{getInitials(u.nome_completo)}</span>
                      <span>{u.nome_completo || u.nome_usuario}</span>
                    </button>
                  ))}
                </div>
              )}

              <button type="button" className="pin-icon-btn" title="Entrar com senha"
                onClick={() => switchMode("password")}>
                <LockKeyhole size={20} />
              </button>
            </div>
          )}
        </section>
      </main>
    );
  }

  // ── Render password mode ──
  return (
    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="login-title">
        <BrandMark className="auth-brand" />

        <form className="auth-form" onSubmit={handleSubmit}>
          <div style={{ textAlign: "center" }}>
            <h1 id="login-title">LOGIN</h1>
            <p>Acesse o sistema com as suas credenciais.</p>
          </div>

          {error ? <p className="form-error" role="alert">{error}</p> : null}

          <label className="auth-field">
            <span>Usuario</span>
            <div>
              <UserRound size={20} />
              <select autoComplete="username" value={username}
                onChange={(e) => { setUsername(e.target.value); setPassword(""); setError(""); setIsPasswordVisible(false); focusPasswordField(); }}
                disabled={isLoadingUsers || isSubmitting} required>
                {loginUsers.map((u) => (
                  <option key={u.id} value={u.nome_usuario}>{u.nome_completo || u.nome_usuario}</option>
                ))}
              </select>
            </div>
          </label>

          <label className="auth-field">
            <span>Senha</span>
            <div>
              <LockKeyhole size={20} />
              <input autoComplete="current-password" autoFocus ref={passwordInputRef}
                type={isPasswordVisible ? "text" : "password"} value={password}
                onChange={(e) => setPassword(e.target.value)} required />
              <button type="button" className="auth-password-toggle"
                aria-label={isPasswordVisible ? "Ocultar senha" : "Mostrar senha"}
                onClick={() => setIsPasswordVisible((c) => !c)}>
                {isPasswordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          <button className="primary-button auth-submit" type="submit" disabled={isSubmitting || isLoadingUsers}>
            <LogIn size={18} />
            {isSubmitting ? "A ENTRAR..." : "LOGIN"}
          </button>
        </form>

        {pinUsers.length > 0 && (
          <button type="button" className="pin-icon-btn" title="Entrar com PIN"
            onClick={() => switchMode("pin")}>
            <Binary size={22} />
          </button>
        )}
      </section>
    </main>
  );
}

export default Login;
