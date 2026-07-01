import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Eye, EyeOff, Pencil, Plus, X } from 'lucide-react';
import { request } from '../../services/ipcClient';

export default function CatalogEditor({ catalogKey, options = [], readOnly = false, onChanged }) {
  const [showInactive, setShowInactive] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [error, setError] = useState('');
  const visible = useMemo(
    () => options.filter((option) => showInactive || option.active),
    [options, showInactive],
  );

  async function mutate(route, payload) {
    setError('');
    try {
      await request(route, payload);
      await onChanged?.();
    } catch (cause) {
      setError(cause?.message || 'Nao foi possivel alterar o catalogo.');
    }
  }

  async function addOption() {
    if (!newName.trim()) return;
    await mutate('configuration.catalog.create', { catalogKey, data: { name: newName } });
    setNewName('');
  }

  async function saveEdit(option) {
    await mutate('configuration.catalog.update', {
      optionId: option.id, data: { name: editingName }, expectedVersion: option.version,
    });
    setEditingId(null);
  }

  async function move(option, direction) {
    const active = options.filter((item) => item.active);
    const index = active.findIndex((item) => item.id === option.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= active.length) return;
    const ordered = [...active];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    await mutate('configuration.catalog.reorder', {
      catalogKey, optionIds: ordered.map((item) => item.id),
    });
  }

  return (
    <section className="catalog-editor">
      <div className="catalog-toolbar">
        <button type="button" className="soft-button" onClick={() => setShowInactive((value) => !value)} title="Mostrar ou ocultar opcoes inativas">
          {showInactive ? <EyeOff size={16} /> : <Eye size={16} />}
          {showInactive ? 'Ocultar inativas' : 'Mostrar inativas'}
        </button>
      </div>
      {!readOnly ? (
        <div className="catalog-add-row">
          <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Nova opcao" />
          <button type="button" aria-label="Adicionar opcao" title="Adicionar opcao" onClick={addOption}><Plus size={17} /></button>
        </div>
      ) : null}
      {visible.map((option, index) => (
        <div className={`catalog-row ${option.active ? '' : 'inactive'}`} key={option.code}>
          {editingId === option.id ? (
            <input value={editingName} onChange={(event) => setEditingName(event.target.value)} />
          ) : <span>{option.name}</span>}
          <small>{option.code}</small>
          {!readOnly && !option.system ? (
            <div className="catalog-actions">
              {editingId === option.id ? (
                <button type="button" aria-label="Editar opcao" title="Guardar nome" onClick={() => saveEdit(option)}><Check size={16} /></button>
              ) : (
                <button type="button" aria-label="Editar opcao" title="Editar opcao" onClick={() => { setEditingId(option.id); setEditingName(option.name); }}><Pencil size={16} /></button>
              )}
              <button type="button" aria-label="Subir opcao" title="Subir opcao" disabled={!option.active || index === 0} onClick={() => move(option, -1)}><ArrowUp size={16} /></button>
              <button type="button" aria-label="Descer opcao" title="Descer opcao" disabled={!option.active || index === visible.length - 1} onClick={() => move(option, 1)}><ArrowDown size={16} /></button>
              <button
                type="button"
                aria-label={option.active ? 'Desativar opcao' : 'Ativar opcao'}
                title={option.active ? 'Desativar opcao' : 'Ativar opcao'}
                onClick={() => mutate(option.active ? 'configuration.catalog.deactivate' : 'configuration.catalog.activate', { optionId: option.id })}
              >{option.active ? <X size={16} /> : <Check size={16} />}</button>
            </div>
          ) : <small title="Opcao tecnica protegida">Somente leitura</small>}
        </div>
      ))}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </section>
  );
}
