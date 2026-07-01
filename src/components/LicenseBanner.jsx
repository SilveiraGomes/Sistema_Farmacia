import React, { useState } from 'react';
import { AlertTriangle, Clock3, LockKeyhole, WifiOff } from 'lucide-react';
import { useLicense } from '../licensing/LicenseContext';
import LicenseActivation from './LicenseActivation';

const content = {
  demo_active: ['Demonstração activa', 'A licença de demonstração está activa por 30 dias.', Clock3],
  unactivated: ['Sistema não activado', 'Introduza uma chave para activar o sistema.', AlertTriangle],
  configuration_error: ['Licenciamento indisponível', 'Contacte o suporte para configurar o serviço de licenças.', AlertTriangle],
  expiring: ['A licença está a terminar', 'Renove a licença para evitar o modo somente leitura.', Clock3],
  offline_grace: ['Validação online pendente', 'Ligue esta máquina à Internet para validar a licença.', WifiOff],
  read_only: ['Modo somente leitura', 'Consultas, relatórios e backups continuam disponíveis.', LockKeyhole],
  expired: ['Licença expirada', 'O sistema está em modo somente leitura.', LockKeyhole],
  clock_tampered: ['Data do sistema inconsistente', 'Corrija a data e valide a licença online.', AlertTriangle],
  revoked: ['Licença revogada', 'O sistema está em modo somente leitura. Contacte o suporte.', LockKeyhole],
  corrupt: ['Licença inválida', 'Valide novamente a licença antes de fazer alterações.', AlertTriangle],
  machine_mismatch: ['Licença de outra máquina', 'Contacte o suporte para transferir a licença.', AlertTriangle],
};

export default function LicenseBanner() {
  const { status } = useLicense();
  const [renewing, setRenewing] = useState(false);
  const state = status.readOnly && !content[status.state] ? 'read_only' : status.state;
  const details = content[state];
  if (!details) return null;
  const [title, message, Icon] = details;
  return (<>
    <aside className={`license-banner ${state}`} role="status">
      <Icon size={20} aria-hidden="true" />
      <div><strong>{title}</strong><span>{message}</span></div>
      <button type="button" onClick={() => setRenewing(true)}>Renovar / revalidar</button>
    </aside>
    {renewing ? (
      <div className="license-renewal-modal" role="dialog" aria-modal="true" aria-label="Renovar licença">
        <LicenseActivation mode="renew" onClose={() => setRenewing(false)} />
      </div>
    ) : null}
  </>);
}
