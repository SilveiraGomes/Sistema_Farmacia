import React, { useState } from 'react';
import { KeyRound, LogOut, RefreshCw, ShieldCheck, Wifi, WifiOff } from 'lucide-react';
import BrandMark from './BrandMark';
import { useLicense } from '../licensing/LicenseContext';
import { formatLicenseKey, getLicenseValidationResult } from '../licensing/licenseUi.mjs';
import { request } from '../services/ipcClient.js';

export default function LicenseActivation({ mode = 'activate', onClose }) {
  const { activate, validate, busy, error, machineId, networkStatus, refresh, status } = useLicense();
  const [licenseKey, setLicenseKey] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (!licenseKey) return;
    try {
      const nextStatus = await (mode === 'renew' ? validate(licenseKey) : activate(licenseKey));
      if (getLicenseValidationResult(nextStatus).success) onClose?.();
    } catch { /* Context exposes a safe message. */ }
  }

  function exitApplication() {
    request('window.close').catch(() => {});
  }

  return (
    <main className="license-activation">
      <aside className="license-activation-aside" aria-hidden="true">
        <div className="license-activation-seal"><ShieldCheck /></div>
        <p>Gestão segura, desde o primeiro acesso.</p>
        <span>Uma entrada protegida para a operação da sua farmácia.</span>
      </aside>
      <section className="license-activation-card" aria-labelledby="activation-title">
        <header className="license-activation-header">
          <BrandMark />
          {!onClose ? (
            <button
              className="license-activation-exit"
              type="button"
              aria-label="Sair da aplicação"
              onClick={exitApplication}
            >
              <LogOut size={17} aria-hidden="true" />
              Sair
            </button>
          ) : null}
        </header>
        <div className="license-activation-intro">
          <div className="license-activation-icon"><ShieldCheck aria-hidden="true" /></div>
          <div>
            <p className="license-eyebrow">KILSYSTEM PHARMACY 1.0.1</p>
            <h1 id="activation-title">{mode === 'renew' ? 'Renovar ou revalidar' : 'Ative esta instalação'}</h1>
          </div>
        </div>
        <p className="license-activation-copy">
          Introduza a chave atribuída a esta máquina para {mode === 'renew' ? 'renovar o acesso' : 'continuar'}.
        </p>
        <div className={`license-network ${networkStatus}`}>
          {networkStatus === 'online'
            ? <Wifi size={16} aria-hidden="true" />
            : <WifiOff size={16} aria-hidden="true" />}
          {networkStatus === 'online' ? 'Ligação disponível' : 'Sem ligação à Internet'}
        </div>
        <form onSubmit={submit}>
          <label htmlFor="license-key">Chave de ativação</label>
          <div className="license-key-field">
            <KeyRound aria-hidden="true" size={20} />
            <input
              id="license-key"
              autoComplete="off"
              inputMode="text"
              maxLength={39}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              value={licenseKey}
              onChange={(event) => setLicenseKey(formatLicenseKey(event.target.value))}
            />
          </div>
          <button className="primary-button license-activate-button" disabled={busy || !licenseKey || networkStatus === 'offline'}>
            {busy ? 'A validar…' : mode === 'renew' ? 'Validar nova chave' : 'Ativar licença'}
          </button>
        </form>
        <div className="license-feedback" aria-live="polite">
          {error || (status.state === 'configuration_error'
            ? 'O serviço de licenças precisa de configuração.'
            : '')}
        </div>
        <dl className="license-machine">
          <dt>Identificação da máquina</dt>
          <dd>{machineId || 'A obter…'}</dd>
        </dl>
        <footer className="license-activation-actions">
          <button className="license-retry" type="button" onClick={refresh} disabled={busy}>
            <RefreshCw size={15} aria-hidden="true" /> Tentar novamente
          </button>
          {onClose ? <button className="license-retry" type="button" onClick={onClose}>Voltar ao sistema</button> : null}
        </footer>
      </section>
    </main>
  );
}
