import { useState, useEffect, useRef } from 'react';
import { Sheet } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Notice } from '../ui/Notice';
import { SettingRow } from '../ui/SettingRow';
import { Toggle } from '../ui/Toggle';

// Project icons are user-chosen labels stored with the project.
const ICONS = ['🥁', '🎵', '🎸', '🎹', '🎷', '🎺', '🎻', '🪘', '🎤', '🔥', '⚡', '🎯', '💪', '🏆', '⭐', '🎶'];

interface ProjectFormData {
  icon: string;
  name: string;
  startBpm: number;
  goalBpm: number;
  accuracyTarget: number;
  autoAdvance: boolean;
  advanceAfterN: number;
  bpmStep: number;
}

interface ProjectCreateSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ProjectFormData) => void | Promise<void>;
  initial?: Partial<ProjectFormData>;
  isEdit?: boolean;
  onDelete?: () => void;
}

export function ProjectCreateSheet(props: ProjectCreateSheetProps) {
  return props.isOpen ? <ProjectForm {...props} /> : null;
}

function ProjectForm({ onClose, onSubmit, initial, isEdit = false, onDelete }: ProjectCreateSheetProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoAdvance, setAutoAdvance] = useState(initial?.autoAdvance ?? true);
  const [accuracyTarget, setAccuracyTarget] = useState(initial?.accuracyTarget ?? 85);
  const [advanceAfterN, setAdvanceAfterN] = useState(initial?.advanceAfterN ?? 3);
  const [bpmStep, setBpmStep] = useState(initial?.bpmStep ?? 5);
  const [icon, setIcon] = useState(initial?.icon || ICONS[0]);
  const [name, setName] = useState(initial?.name || '');
  const [startBpm, setStartBpm] = useState(initial?.startBpm || 80);
  const [goalBpm, setGoalBpm] = useState(initial?.goalBpm || 120);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // After the dialog takes focus, move it to the first field for new projects.
    if (isEdit) return;
    const timer = setTimeout(() => nameRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [isEdit]);

  const rangeError = goalBpm < startBpm ? 'Goal tempo must be at least the start tempo.' : startBpm < 10 || goalBpm > 400 ? 'Tempos must be between 10 and 400 BPM.' : null;
  const isValid = name.trim().length > 0 && !rangeError && accuracyTarget >= 1 && accuracyTarget <= 100 && advanceAfterN >= 1 && advanceAfterN <= 100 && Number.isInteger(advanceAfterN) && bpmStep >= 0.5 && bpmStep <= 100;

  const handleSubmit = async () => {
    if (!isValid || saving) return;
    setSaving(true); setError(null);
    try { await onSubmit({ icon, name: name.trim(), startBpm, goalBpm, accuracyTarget, autoAdvance, advanceAfterN, bpmStep }); onClose(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save this project.'); }
    finally { setSaving(false); }
  };

  return (
    <Sheet title={isEdit ? 'Edit project' : 'New project'} onClose={onClose} headerAction={<Button variant="quiet" onClick={onClose}>Cancel</Button>}>
      <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); void handleSubmit(); }}>
        <Field label="Name">
          <input aria-label="Project name" ref={nameRef} type="text" value={name} onChange={(event) => setName(event.target.value)}
            placeholder="For example, Paradiddles" maxLength={40} className="ui-input" />
        </Field>

        <div className="ui-field">
          <span className="ui-label">Icon</span>
          <div role="group" aria-label="Project icon" className="grid grid-cols-8 gap-1">
            {ICONS.map((choice) => (
              <button key={choice} type="button" aria-pressed={choice === icon} onClick={() => setIcon(choice)}
                className={`flex h-11 items-center justify-center rounded-lg text-lg ${choice === icon ? 'bg-accent-dim shadow-[inset_0_0_0_2px_var(--accent)]' : 'active:bg-bg-raised'}`}>
                {choice}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Start BPM">
            <input type="number" aria-label="Start BPM" min={10} max={400} step={0.5} value={startBpm} onChange={(event) => setStartBpm(Number(event.target.value))} className="ui-input tabular-nums" />
          </Field>
          <Field label="Goal BPM">
            <input type="number" aria-label="Goal BPM" min={10} max={400} step={0.5} value={goalBpm} onChange={(event) => setGoalBpm(Number(event.target.value))} className="ui-input tabular-nums" />
          </Field>
        </div>
        {name.trim() && rangeError && <p role="status" className="text-sm text-warning">{rangeError}</p>}

        <div className="ui-rows border-y border-border-subtle">
          <SettingRow label="Advance tempo automatically" description="Raise the practice tempo after enough successful takes.">
            <Toggle label="Advance tempo after successful takes" enabled={autoAdvance} onChange={setAutoAdvance} />
          </SettingRow>
          {autoAdvance && (
            <div className="grid grid-cols-3 gap-2 py-3">
              <Field label="Target %"><input aria-label="Target score" type="number" min={1} max={100} value={accuracyTarget} onChange={(event) => setAccuracyTarget(Number(event.target.value))} className="ui-input tabular-nums" /></Field>
              <Field label="Passing takes"><input aria-label="Passing takes" type="number" min={1} max={100} value={advanceAfterN} onChange={(event) => setAdvanceAfterN(Number(event.target.value))} className="ui-input tabular-nums" /></Field>
              <Field label="BPM step"><input aria-label="BPM step" type="number" min={0.5} max={100} step={0.5} value={bpmStep} onChange={(event) => setBpmStep(Number(event.target.value))} className="ui-input tabular-nums" /></Field>
            </div>
          )}
        </div>

        {error && <Notice tone="danger">{error}</Notice>}

        <div className="grid gap-2">
          <Button type="submit" variant="primary" size="lg" disabled={!isValid || saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create project'}
          </Button>
          {isEdit && onDelete && <Button variant="danger-quiet" onClick={onDelete}>Delete project</Button>}
        </div>
      </form>
    </Sheet>
  );
}
