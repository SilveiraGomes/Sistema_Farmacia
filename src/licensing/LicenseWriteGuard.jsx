import React, { useEffect, useRef } from 'react';
import { useLicense } from './LicenseContext';
import {
  applyLicenseControlState,
  getLicenseObserverOptions,
  isLicenseWriteTarget,
  resolveLicenseEventTarget,
  recordLicenseDisabledMutations,
  shouldRefreshLicenseControls,
} from './licenseWritePolicy.mjs';

export default function LicenseWriteGuard({ children }) {
  const { status } = useLicense();
  const blocked = status.readOnly === true;
  const rootRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const updateControls = () => {
      root.querySelectorAll('button, [role="button"], input[type="submit"], [data-license-write], [data-license-original-title], [data-license-disabled]')
        .forEach((control) => {
          const tracked = control.hasAttribute('data-license-original-title')
            || control.hasAttribute('data-license-disabled');
          if (blocked ? !isLicenseWriteTarget(control) : !tracked) return;
          applyLicenseControlState(control, blocked);
        });
    };

    updateControls();
    const observer = new MutationObserver((records) => {
      recordLicenseDisabledMutations(records);
      if (shouldRefreshLicenseControls(records)) updateControls();
    });
    observer.observe(root, getLicenseObserverOptions());
    return () => observer.disconnect();
  }, [blocked]);

  function stop(event) {
    const writeTarget = resolveLicenseEventTarget(event);
    if (!blocked || !writeTarget) return;
    event.preventDefault();
    event.stopPropagation();
    writeTarget?.closest?.('button, [role="button"], input, select, textarea, form')
      ?.setAttribute('aria-disabled', 'true');
  }

  return (
    <div
      ref={rootRef}
      className={blocked ? 'license-write-guard is-read-only' : 'license-write-guard'}
      onClickCapture={stop}
      onSubmitCapture={stop}
      onKeyDownCapture={(event) => {
        if (event.key === 'Enter' || event.key === ' ') stop(event);
      }}
    >
      {children}
    </div>
  );
}
