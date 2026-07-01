import React from 'react';

export default function SettingsSectionNav({ sections, activeSection, onChange }) {
  return (
    <nav className="settings-section-nav" aria-label="Seccoes de configuracao">
      {sections.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          aria-current={activeSection === id ? 'page' : undefined}
          onClick={() => onChange(id)}
        >
          <Icon size={18} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
