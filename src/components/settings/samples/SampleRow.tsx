import { useState } from 'react';
import type { CustomSampleRecord } from '../../../store/db';
import { Button, IconButton } from '../../ui/Button';
import { formatBytes } from './sampleAudio';

export function SampleRow({ sample, onPreview, onDelete }: { sample: CustomSampleRecord; onPreview: () => void; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex min-h-[52px] items-center gap-2 py-1">
      <IconButton aria-label={`Preview ${sample.name}`} onClick={onPreview} className="-ml-2">
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21" /></svg>
      </IconButton>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-text-primary">{sample.name}</p>
        <p className="text-xs text-text-muted tabular-nums">{sample.durationMs} ms · {formatBytes(sample.blob.size)}</p>
      </div>
      {confirming ? (
        <div className="flex gap-1" role="group" aria-label={`Delete ${sample.name}?`}>
          <Button variant="quiet" onClick={() => setConfirming(false)}>Keep</Button>
          <Button variant="danger-quiet" onClick={onDelete}>Delete</Button>
        </div>
      ) : (
        <IconButton aria-label={`Delete ${sample.name}`} onClick={() => setConfirming(true)} className="-mr-2">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>
        </IconButton>
      )}
    </div>
  );
}
