import React from 'react';
import { CircleHelp } from 'lucide-react';

export default function SettingField({ icon: Icon, label, help, error, children }) {
  return (
    <label className="setting-field">
      <span className="setting-field-label">
        {Icon ? <Icon size={17} aria-hidden="true" /> : null}
        <span>{label}</span>
        {help ? (
          <span className="setting-help" tabIndex="0" aria-label={help} title={help}>
            <CircleHelp size={15} aria-hidden="true" />
            <span role="tooltip">{help}</span>
          </span>
        ) : null}
      </span>
      {children}
      {error ? <small className="form-error">{error}</small> : null}
    </label>
  );
}
