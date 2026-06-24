import React, { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { formatKwanza } from '../data/pharmacyData.mjs';

export const CANCELLATION_REASONS = [
  'Erro no registo',
  'Produto devolvido pelo cliente',
  'Produto danificado',
  'Duplicação de venda',
  'Pedido do cliente',
  'Outro',
];

function CancellationModal({ document, onConfirm, onClose }) {
  const [reason, setReason] = useState(CANCELLATION_REASONS[0]);
  const [customReason, setCustomReason] = useState('');
  const today = new Date().toLocaleDateString('pt-AO', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const finalReason = reason === 'Outro' ? customReason.trim() : reason;
  const canConfirm = finalReason.length > 0;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card cancellation-modal-card">
        <div className="modal-title-row">
          <h2>Anular Documento</h2>
          <button type="button" onClick={onClose}>×</button>
        </div>

        <div className="cancellation-modal-body">
          <div className="cancellation-doc-info">
            <div className="cancellation-doc-row">
              <span>Documento</span>
              <strong>{document.number}</strong>
            </div>
            <div className="cancellation-doc-row">
              <span>Cliente</span>
              <strong>{document.clientName || 'Consumidor final'}</strong>
            </div>
            <div className="cancellation-doc-row">
              <span>Valor</span>
              <strong>{formatKwanza(document.total)}</strong>
            </div>
            <div className="cancellation-doc-row">
              <span>Data</span>
              <strong>{today}</strong>
            </div>
          </div>

          <p className="cancellation-warning">
            Esta acção é irreversível. Será gerada uma Nota de Crédito automaticamente.
          </p>

          <label className="cancellation-label">
            <span>Motivo de anulação</span>
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              {CANCELLATION_REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>

          {reason === 'Outro' && (
            <label className="cancellation-label">
              <span>Descreva o motivo</span>
              <input
                type="text"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Descreva o motivo..."
                autoFocus
              />
            </label>
          )}

          <div className="cancellation-signature-section">
            <div className="cancellation-signature-block">
              <div className="cancellation-signature-line" />
              <span>Assinatura do Cliente / Responsável</span>
            </div>
            <div className="cancellation-signature-block">
              <div className="cancellation-signature-line" />
              <span>Assinatura do Operador</span>
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="soft-button" onClick={onClose}>Cancelar</button>
          <button
            type="button"
            className="soft-button danger cancellation-confirm-btn"
            disabled={!canConfirm}
            onClick={() => onConfirm(finalReason)}
          >
            <RotateCcw size={15} />
            Confirmar Anulação
          </button>
        </div>
      </div>
    </div>
  );
}

export default CancellationModal;
