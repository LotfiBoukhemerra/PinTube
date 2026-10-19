import { CloudOff, Coffee, Download, FileText, Heart, ShieldCheck, Trash, Upload } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { DONATION_LINKS } from '../../config/links';
import { LOCALES, isLocaleCode } from '../../i18n';
import {
  createBackup,
  createMarkdown,
  InvalidBackupError,
  parseBackup,
  prepareImport,
  UnsupportedBackupError,
} from '../../services/backup';
import { deleteAllRecords, getRawLibrary, mergeLibrary } from '../../storage/repository';
import { updateSettings } from '../../storage/settings';
import type { Library, ResumeBehavior, Theme } from '../../shared/types';
import { useApp } from '../app-context';
import { dateStamp, downloadText } from '../utils';

/** Refuse absurdly large files before reading them. */
const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card section">
      <h2 className="section-title">{title}</h2>
      <div className="section-body">{children}</div>
    </section>
  );
}

export function SettingsView({ library }: { library: Library | null }) {
  const { t, settings } = useApp();
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [importing, setImporting] = useState(false);

  const exportJson = () => {
    if (!library) return;
    downloadText(`pintube-backup-${dateStamp()}.json`, createBackup(library), 'application/json');
  };

  const exportMarkdown = () => {
    if (!library) return;
    const md = createMarkdown(library, { title: 'PinTube', unsortedLabel: t('nav.unsorted') });
    downloadText(`pintube-notes-${dateStamp()}.md`, md, 'text/markdown');
  };

  const importJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || importing) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setMessage({ kind: 'error', text: t('data.importTooLarge') });
      return;
    }
    setImporting(true);
    setMessage(null);
    try {
      const { library: incoming, skipped } = parseBackup(await file.text());
      const count = await mergeLibrary(prepareImport(incoming, await getRawLibrary()));
      const parts = [count > 0 ? t('data.importSuccess', { count }) : t('data.importNothing')];
      if (skipped > 0) parts.push(t('data.importSkipped', { count: skipped }));
      setMessage({ kind: 'ok', text: parts.join(' ') });
    } catch (e) {
      // Only a file that is not a backup gets the "not a valid backup" message:
      // a failure to read the file or to write the library is a different problem.
      const key =
        e instanceof UnsupportedBackupError
          ? 'data.importNewer'
          : e instanceof InvalidBackupError
            ? 'data.importError'
            : 'common.error';
      setMessage({ kind: 'error', text: t(key) });
    } finally {
      setImporting(false);
    }
  };

  const deleteAll = async () => {
    if (window.confirm(t('data.deleteAllConfirm'))) await deleteAllRecords();
  };

  return (
    <div className="page page-narrow">
      <header className="page-header">
        <h1 className="page-title">{t('settings.title')}</h1>
      </header>

      <Section title={t('settings.appearance')}>
        <div className="grid-2">
          <label className="field">
            <span className="field-label">{t('settings.language')}</span>
            <select
              className="select"
              value={settings.language}
              onChange={(e) => isLocaleCode(e.target.value) && void updateSettings({ language: e.target.value })}
            >
              {Object.entries(LOCALES).map(([code, locale]) => (
                <option key={code} value={code}>
                  {locale.nativeName}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">{t('settings.theme')}</span>
            <select
              className="select"
              value={settings.theme}
              onChange={(e) => void updateSettings({ theme: e.target.value as Theme })}
            >
              <option value="system">{t('settings.themeSystem')}</option>
              <option value="light">{t('settings.themeLight')}</option>
              <option value="dark">{t('settings.themeDark')}</option>
            </select>
          </label>
        </div>
      </Section>

      <Section title={t('settings.playback')}>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.autoSave}
            onChange={(e) => void updateSettings({ autoSave: e.target.checked })}
          />
          <span>
            <span className="field-label">{t('settings.autoSave')}</span>
            <span className="subtle block">{t('settings.autoSaveHint')}</span>
          </span>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.showPlayerButton}
            onChange={(e) => void updateSettings({ showPlayerButton: e.target.checked })}
          />
          <span className="field-label">{t('settings.playerButton')}</span>
        </label>
        <label className="field">
          <span className="field-label">{t('settings.resume')}</span>
          <select
            className="select"
            value={settings.resumeBehavior}
            onChange={(e) => void updateSettings({ resumeBehavior: e.target.value as ResumeBehavior })}
          >
            <option value="ask">{t('settings.resumeAsk')}</option>
            <option value="auto">{t('settings.resumeAuto')}</option>
            <option value="off">{t('settings.resumeOff')}</option>
          </select>
        </label>
      </Section>

      <Section title={t('data.title')}>
        <p className="notice with-icon privacy">
          <ShieldCheck className="icon" /> {t('data.privacy')}
        </p>
        <div className="button-row">
          <button className="btn" onClick={exportJson} disabled={!library}>
            <Download /> {t('data.exportJson')}
          </button>
          <button className="btn" onClick={() => fileInput.current?.click()} disabled={importing}>
            <Upload /> {t('data.importJson')}
          </button>
          <button className="btn" onClick={exportMarkdown} disabled={!library}>
            <FileText /> {t('data.exportMarkdown')}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => void importJson(e)}
          />
        </div>
        {message && (
          <p className={message.kind === 'ok' ? 'notice' : 'notice notice-error'} role="status">
            {message.text}
          </p>
        )}
        <div className="danger-zone">
          <button className="btn btn-danger" onClick={() => void deleteAll()}>
            <Trash /> {t('data.deleteAll')}
          </button>
        </div>
      </Section>

      <Section title={t('sync.title')}>
        <p className="notice with-icon">
          <CloudOff className="icon" /> {t('sync.cloudSoon')}
        </p>
      </Section>

      <Section title={t('support.title')}>
        <p className="muted">{t('support.body')}</p>
        <div className="button-row">
          <a className="btn btn-primary" href={DONATION_LINKS.kofi} target="_blank" rel="noopener noreferrer">
            <Coffee /> Ko-fi
          </a>
          <a className="btn" href={DONATION_LINKS.paypal} target="_blank" rel="noopener noreferrer">
            <Heart /> PayPal
          </a>
        </div>
      </Section>
    </div>
  );
}
