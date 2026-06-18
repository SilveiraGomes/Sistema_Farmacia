import React, { useEffect, useMemo, useState } from 'react';
import {
  getBrandingInitials,
  getStoredBranding,
  subscribeBrandingChange,
} from '../data/branding.mjs';

function splitBrandName(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length <= 1) {
    return [parts[0] || 'Sistema', 'Farmacia'];
  }

  return [parts.slice(0, -1).join(' '), parts.at(-1)];
}

function BrandMark({ className = 'brand-card' }) {
  const [branding, setBranding] = useState(() => getStoredBranding());
  const [firstLine, secondLine] = useMemo(
    () => splitBrandName(branding.pharmacyName),
    [branding.pharmacyName],
  );
  const initials = getBrandingInitials(branding.pharmacyName);

  useEffect(() => subscribeBrandingChange(setBranding), []);

  return (
    <div className={className} aria-label={branding.pharmacyName}>
      <span className={branding.logoDataUrl ? 'brand-capsule has-image' : 'brand-capsule'}>
        {branding.logoDataUrl ? (
          <img src={branding.logoDataUrl} alt="" aria-hidden="true" />
        ) : (
          <span>{initials}</span>
        )}
      </span>
      <span className="brand-text">
        <strong>{firstLine}</strong>
        <strong>{secondLine}</strong>
      </span>
    </div>
  );
}

export default BrandMark;
