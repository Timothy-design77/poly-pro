import { HelpTip } from '../ui/HelpTip';

/**
 * Cloud enhancement is intentionally disabled in the static PWA until a
 * server-side credential/proxy layer and current provider contract exist.
 * Shipping a browser-direct upload flow would expose implementation details
 * and falsely imply a supported integration.
 */
export function CloudSettings() {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-text-secondary flex items-center gap-1">
          Enhanced Analysis
          <HelpTip text="Cloud stem separation is not enabled in this build. Core recording and analysis remain fully local." />
        </span>
        <span className="rounded-full border border-border-subtle px-2 py-1 text-[10px] text-text-muted">Unavailable</span>
      </div>
      <p className="text-[10px] text-text-muted leading-relaxed">A secure server-side integration is required before recordings can be sent to a third-party separation service. No audio is uploaded by this build.</p>
    </div>
  );
}
