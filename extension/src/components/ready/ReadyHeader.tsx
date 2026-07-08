import { useEffect, useRef, useState } from 'react';
import {
  FaGear,
  FaCloudArrowDown,
  FaShieldHalved,
  FaTrashCan,
} from 'react-icons/fa6';

interface ReadyHeaderProps {
  onBackup: () => void;
  onDelete: () => void;
  onTrustedSites: () => void;
  preferSparkPayments: boolean;
  onPreferSparkPaymentsChange: (value: boolean) => void;
}

export function ReadyHeader({
  onBackup,
  onDelete,
  onTrustedSites,
  preferSparkPayments,
  onPreferSparkPaymentsChange,
}: ReadyHeaderProps) {
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const settingsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showSettingsMenu) return;
    const onMouseDown = (e: MouseEvent) => {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(e.target as Node)) {
        setShowSettingsMenu(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowSettingsMenu(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showSettingsMenu]);


  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <img src="/tiptgreen.svg" alt="TIPT" className="w-7 h-7" />
        <h1 className="text-lg font-bold text-neutral-900 dark:text-neutral-200">WALLET</h1>
      </div>
      <div className="relative" ref={settingsMenuRef}>
        <button
          onClick={() => setShowSettingsMenu((v) => !v)}
          title="Settings"
          aria-haspopup="menu"
          aria-expanded={showSettingsMenu}
          className={`p-1.5 rounded-lg transition-colors ${
            showSettingsMenu
              ? 'text-neutral-900 bg-neutral-200 dark:text-neutral-100 dark:bg-neutral-800'
              : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:text-neutral-100 dark:hover:bg-neutral-800'
          }`}
        >
          <FaGear className="w-4 h-4" />
        </button>
        {showSettingsMenu && (
          <div
            role="menu"
            aria-label="Wallet settings"
            className="tipt-menu-pop absolute right-0 top-10 z-20 w-52 p-1.5 rounded-xl bg-white/95 backdrop-blur shadow-lg ring-1 ring-black/5 dark:bg-neutral-900/95 dark:ring-white/10"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onBackup();
                setShowSettingsMenu(false);
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-left text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white transition-colors"
            >
              <FaCloudArrowDown className="w-3.5 h-3.5 shrink-0 opacity-70" />
              <span>Backup Wallet</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onTrustedSites();
                setShowSettingsMenu(false);
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-left text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white transition-colors"
            >
              <FaShieldHalved className="w-3.5 h-3.5 shrink-0 opacity-70" />
              <span>Trusted Sites</span>
            </button>
            <label className="w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-md text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800 transition-colors cursor-pointer">
              <span>Prefer Spark when available</span>
              <input
                type="checkbox"
                checked={preferSparkPayments}
                onChange={(e) => onPreferSparkPaymentsChange(e.target.checked)}
                className="w-4 h-4 accent-neutral-900 dark:accent-neutral-200"
              />
            </label>
            <div className="my-1 h-px bg-neutral-200 dark:bg-neutral-800" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onDelete();
                setShowSettingsMenu(false);
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-left text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300 transition-colors"
            >
              <FaTrashCan className="w-3.5 h-3.5 shrink-0 opacity-80" />
              <span>Delete Wallet</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
