from __future__ import annotations

from pathlib import Path
import json
import re

ROOT = Path.cwd()


def read(path: str) -> str:
    return (ROOT / path).read_text()


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)


def insert_import(source: str, import_line: str) -> str:
    if import_line in source:
        return source
    lines = source.splitlines()
    inside_import = False
    last_import = -1
    for index, line in enumerate(lines):
        stripped = line.strip()
        if not inside_import and stripped.startswith("import "):
            inside_import = True
        if inside_import:
            last_import = index
            if ";" in stripped:
                inside_import = False
        elif last_import >= 0 and stripped and not stripped.startswith("//"):
            break
    if last_import < 0:
        raise RuntimeError(f"No imports found for {import_line}")
    lines.insert(last_import + 1, import_line)
    return "\n".join(lines) + "\n"


# Correct the keypad synchronization defect with a deterministic open cycle.
number_path = "src/components/ui/NumberInput.tsx"
old_number = read(number_path)
default_export = "export default NumberInput" in old_number
number_source = '''import { useEffect, useRef, useState } from 'react';

interface NumberInputProps {
  isOpen: boolean;
  onClose: () => void;
  initialValue: number;
  min: number;
  max: number;
  step?: number;
  onSubmit: (value: number) => void;
  onLiveChange?: (value: number) => void;
  label?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

export function NumberInput({
  isOpen,
  onClose,
  initialValue,
  min,
  max,
  step = 1,
  onSubmit,
  onLiveChange,
  label = 'Value',
}: NumberInputProps) {
  const [input, setInput] = useState(() => formatValue(initialValue));
  const suppressLiveChangeRef = useRef(true);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      suppressLiveChangeRef.current = true;
      return;
    }
    suppressLiveChangeRef.current = true;
    setInput(formatValue(initialValue));
    requestAnimationFrame(() => dialogRef.current?.focus());
  }, [isOpen, initialValue]);

  useEffect(() => {
    if (!isOpen || !onLiveChange) return;
    if (suppressLiveChangeRef.current) {
      suppressLiveChangeRef.current = false;
      return;
    }
    const parsed = Number(input);
    if (!Number.isFinite(parsed)) return;
    onLiveChange(clamp(parsed, min, max));
  }, [input, isOpen, min, max, onLiveChange]);

  if (!isOpen) return null;

  const append = (character: string) => {
    setInput((current) => {
      if (character === '.' && current.includes('.')) return current;
      if (current === '0' && character !== '.') return character;
      return `${current}${character}`.slice(0, 7);
    });
  };

  const backspace = () => setInput((current) => current.slice(0, -1) || '0');
  const adjust = (direction: -1 | 1) => {
    const parsed = Number(input);
    const base = Number.isFinite(parsed) ? parsed : initialValue;
    setInput(formatValue(clamp(Math.round((base + direction * step) * 2) / 2, min, max)));
  };
  const commit = () => {
    const parsed = Number(input);
    const value = clamp(Number.isFinite(parsed) ? parsed : initialValue, min, max);
    onSubmit(value);
    onClose();
  };

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0'];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-4 sm:items-center"
      data-no-swipe
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="number-input-title"
        tabIndex={-1}
        className="w-full max-w-sm rounded-3xl border border-white/15 bg-bg-elevated p-5 shadow-2xl outline-none"
      >
        <div id="number-input-title" className="mb-1 text-center text-sm font-semibold text-text-secondary">
          {label}
        </div>
        <div className="mb-4 text-center font-mono text-4xl font-bold text-text-primary" aria-live="polite">
          {input}
        </div>

        <div className="mb-3 grid grid-cols-3 gap-2">
          {keys.map((key) => (
            <button
              key={key}
              type="button"
              className="min-h-14 rounded-2xl bg-bg-surface text-xl font-semibold text-text-primary active:scale-95"
              onClick={() => append(key)}
              aria-label={key === '.' ? 'Decimal point' : key}
            >
              {key}
            </button>
          ))}
          <button
            type="button"
            className="min-h-14 rounded-2xl bg-bg-surface text-lg font-semibold text-text-primary active:scale-95"
            onClick={backspace}
            aria-label="Backspace"
          >
            ⌫
          </button>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2">
          <button type="button" className="min-h-12 rounded-xl bg-bg-surface text-text-primary" onClick={() => adjust(-1)} aria-label={`Decrease ${label}`}>
            −{step}
          </button>
          <button type="button" className="min-h-12 rounded-xl bg-bg-surface text-text-primary" onClick={() => adjust(1)} aria-label={`Increase ${label}`}>
            +{step}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button type="button" className="min-h-12 rounded-xl border border-white/15 text-text-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="min-h-12 rounded-xl bg-white font-semibold text-black" onClick={commit}>
            Set
          </button>
        </div>
      </div>
    </div>
  );
}
'''
if default_export:
    number_source += "\nexport default NumberInput;\n"
write(number_path, number_source)

# Explicit timeout and cancellation primitive.
write(
    "src/utils/with-timeout.ts",
    '''export class OperationTimeoutError extends Error {
  readonly code = 'OPERATION_TIMEOUT';

  constructor(message: string) {
    super(message);
    this.name = 'OperationTimeoutError';
  }
}

export interface TimeoutOptions {
  signal?: AbortSignal;
  onTimeout?: () => void | Promise<void>;
}

export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  message: string,
  options: TimeoutOptions = {},
): Promise<T> {
  if (options.signal?.aborted) {
    throw options.signal.reason ?? new DOMException('Aborted', 'AbortError');
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortHandler: (() => void) | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(async () => {
      try {
        await options.onTimeout?.();
      } finally {
        reject(new OperationTimeoutError(message));
      }
    }, timeoutMs);
  });

  const aborted = new Promise<never>((_, reject) => {
    if (!options.signal) return;
    abortHandler = () => reject(options.signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    options.signal.addEventListener('abort', abortHandler, { once: true });
  });

  try {
    return await Promise.race([operation, timeout, aborted]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (abortHandler && options.signal) options.signal.removeEventListener('abort', abortHandler);
  }
}
''',
)
write(
    "src/utils/with-timeout.test.ts",
    '''import { afterEach, describe, expect, it, vi } from 'vitest';
import { OperationTimeoutError, withTimeout } from './with-timeout';

describe('withTimeout', () => {
  afterEach(() => vi.useRealTimers());

  it('returns a completed operation', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 100, 'late')).resolves.toBe('ok');
  });

  it('rejects a stalled operation and runs timeout cleanup', async () => {
    vi.useFakeTimers();
    const cleanup = vi.fn();
    const pending = withTimeout(new Promise<never>(() => {}), 250, 'stalled', { onTimeout: cleanup });
    const assertion = expect(pending).rejects.toBeInstanceOf(OperationTimeoutError);
    await vi.advanceTimersByTimeAsync(250);
    await assertion;
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('honors AbortSignal cancellation', async () => {
    const controller = new AbortController();
    const pending = withTimeout(new Promise<never>(() => {}), 10_000, 'late', { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
''',
)

# Incremental recording storage. OPFS is preferred; memory is an explicit compatibility fallback.
write(
    "src/storage/recording-writer.ts",
    '''export interface RecordingWriter {
  append(samples: Float32Array): Promise<void>;
  finalize(): Promise<Blob>;
  abort(): Promise<void>;
  readonly storage: 'opfs' | 'memory';
}

class MemoryRecordingWriter implements RecordingWriter {
  readonly storage = 'memory' as const;
  private chunks: BlobPart[] = [];
  private aborted = false;

  async append(samples: Float32Array): Promise<void> {
    if (this.aborted) return;
    this.chunks.push(samples.buffer.slice(samples.byteOffset, samples.byteOffset + samples.byteLength));
  }

  async finalize(): Promise<Blob> {
    if (this.aborted) throw new DOMException('Recording was aborted', 'AbortError');
    const blob = new Blob(this.chunks, { type: 'application/octet-stream' });
    this.chunks = [];
    return blob;
  }

  async abort(): Promise<void> {
    this.aborted = true;
    this.chunks = [];
  }
}

class OpfsRecordingWriter implements RecordingWriter {
  readonly storage = 'opfs' as const;
  private queue = Promise.resolve();
  private closed = false;

  constructor(
    private readonly root: FileSystemDirectoryHandle,
    private readonly filename: string,
    private readonly handle: FileSystemFileHandle,
    private readonly writable: FileSystemWritableFileStream,
  ) {}

  append(samples: Float32Array): Promise<void> {
    if (this.closed) return Promise.reject(new Error('Recording writer is closed'));
    const copy = samples.buffer.slice(samples.byteOffset, samples.byteOffset + samples.byteLength);
    this.queue = this.queue.then(() => this.writable.write(copy));
    return this.queue;
  }

  async finalize(): Promise<Blob> {
    if (this.closed) throw new Error('Recording writer is closed');
    await this.queue;
    await this.writable.close();
    this.closed = true;
    const file = await this.handle.getFile();
    const blob = file.slice(0, file.size, 'application/octet-stream');
    await this.root.removeEntry(this.filename).catch(() => undefined);
    return blob;
  }

  async abort(): Promise<void> {
    if (!this.closed) {
      await this.queue.catch(() => undefined);
      await this.writable.abort().catch(() => undefined);
      this.closed = true;
    }
    await this.root.removeEntry(this.filename).catch(() => undefined);
  }
}

export async function createRecordingWriter(id = crypto.randomUUID()): Promise<RecordingWriter> {
  try {
    const storage = navigator.storage as StorageManager & {
      getDirectory?: () => Promise<FileSystemDirectoryHandle>;
    };
    if (!storage.getDirectory) return new MemoryRecordingWriter();
    const root = await storage.getDirectory();
    const filename = `poly-pro-recording-${id}.pcm`;
    const handle = await root.getFileHandle(filename, { create: true });
    const writable = await handle.createWritable();
    return new OpfsRecordingWriter(root, filename, handle, writable);
  } catch (error) {
    console.warn('OPFS unavailable; using the compatible in-memory recording writer.', error);
    return new MemoryRecordingWriter();
  }
}
''',
)

# Worker-backed analysis with deterministic fallback.
write(
    "src/analysis/analysis-runner.ts",
    '''import { analyzeSession } from './index';

type AnalyzeArguments = Parameters<typeof analyzeSession>;
type AnalyzeResult = Awaited<ReturnType<typeof analyzeSession>>;
type ProgressCallback = (value: unknown) => void;

interface WorkerRequest {
  id: string;
  args: unknown[];
}

interface WorkerResponse {
  id: string;
  type: 'progress' | 'result' | 'error';
  payload?: unknown;
  error?: string;
}

export async function runAnalysis(...args: AnalyzeArguments): Promise<AnalyzeResult> {
  const finalArgument = args.at(-1);
  const hasProgress = typeof finalArgument === 'function';
  const progress = (hasProgress ? finalArgument : undefined) as ProgressCallback | undefined;
  const serializableArgs = (hasProgress ? args.slice(0, -1) : args) as unknown[];

  if (typeof Worker === 'undefined') return analyzeSession(...args);

  const worker = new Worker(new URL('../workers/analysis.worker.ts', import.meta.url), { type: 'module' });
  const id = crypto.randomUUID();

  return new Promise<AnalyzeResult>((resolve, reject) => {
    const cleanup = () => worker.terminate();
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== id) return;
      if (event.data.type === 'progress') {
        progress?.(event.data.payload);
        return;
      }
      cleanup();
      if (event.data.type === 'result') resolve(event.data.payload as AnalyzeResult);
      else reject(new Error(event.data.error ?? 'Analysis worker failed'));
    };
    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || 'Analysis worker failed'));
    };
    const request: WorkerRequest = { id, args: serializableArgs };
    worker.postMessage(request);
  }).catch((error) => {
    console.warn('Analysis worker unavailable; using main-thread compatibility mode.', error);
    return analyzeSession(...args);
  });
}
''',
)
write(
    "src/workers/analysis.worker.ts",
    '''import { analyzeSession } from '../analysis';

interface WorkerRequest {
  id: string;
  args: unknown[];
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, args } = event.data;
  try {
    const progress = (payload: unknown) => self.postMessage({ id, type: 'progress', payload });
    const callable = analyzeSession as unknown as (...values: unknown[]) => Promise<unknown>;
    const result = await callable(...args, progress);
    self.postMessage({ id, type: 'result', payload: result });
  } catch (error) {
    self.postMessage({
      id,
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export {};
''',
)

analysis_hook = "src/hooks/useAnalysis.ts"
source = read(analysis_hook)
source = insert_import(source, "import { runAnalysis } from '../analysis/analysis-runner';")
source = re.sub(r"\banalyzeSession\s*,\s*", "", source)
source = re.sub(r",\s*analyzeSession\b", "", source)
source = re.sub(r"\banalyzeSession\s*\(", "runAnalysis(", source)
write(analysis_hook, source)

# Harden the existing recording workflow without replacing its established session behavior.
recording_path = "src/hooks/useRecording.ts"
source = read(recording_path)
source = insert_import(source, "import { withTimeout } from '../utils/with-timeout';")
source = insert_import(source, "import { createRecordingWriter, type RecordingWriter } from '../storage/recording-writer';")

if "isPreparing" not in source:
    state_match = re.search(
        r"(const\s*\[\s*\w+\s*,\s*\w+\s*\]\s*=\s*useState(?:<[^;]+?>)?\s*\([^;]*\)\s*;)",
        source,
        re.S,
    )
    if state_match:
        source = source[: state_match.end()] + "\n  const [isPreparing, setIsPreparing] = useState(false);" + source[state_match.end() :]
    else:
        ref_match = re.search(r"const\s+\w+Ref\s*=\s*useRef", source)
        if not ref_match:
            raise RuntimeError("useRecording state insertion point not found")
        source = source[: ref_match.start()] + "const [isPreparing, setIsPreparing] = useState(false);\n  " + source[ref_match.start() :]

if "recordingWriterRef" not in source:
    chunks = re.search(r"const\s+pcmChunksRef\s*=\s*useRef<[^;]+;", source)
    addition = "\n  const recordingWriterRef = useRef<RecordingWriter | null>(null);\n  const preparationAbortRef = useRef<AbortController | null>(null);"
    if chunks:
        source = source[: chunks.end()] + addition + source[chunks.end() :]
    else:
        first_effect = source.find("  useEffect(")
        if first_effect < 0:
            raise RuntimeError("useRecording ref insertion point not found")
        source = source[:first_effect] + addition.strip() + "\n\n" + source[first_effect:]

start = re.search(r"(const\s+startRecording\s*=\s*useCallback\s*\(\s*async\s*\([^)]*\)\s*=>\s*\{)", source)
if not start:
    raise RuntimeError("useRecording start callback not found")
if "preparationAbortRef.current = new AbortController" not in source:
    preparation = "\n    if (isRecordingRef.current || isPreparing) return;\n    setIsPreparing(true);\n    const preparationController = new AbortController();\n    preparationAbortRef.current?.abort();\n    preparationAbortRef.current = preparationController;"
    source = source[: start.end()] + preparation + source[start.end() :]

for function_name in ["getBuiltInMicStream", "getMicrophoneStream", "getRawMicStream"]:
    pattern = rf"await\s+{function_name}\(([^;]*?)\)"
    if re.search(pattern, source, re.S) and f"withTimeout({function_name}(" not in source:
        source = re.sub(
            pattern,
            rf"await withTimeout({function_name}(\1), 15_000, 'Microphone initialization timed out', {{ signal: preparationController.signal }})",
            source,
            count=1,
            flags=re.S,
        )
        break

if "audioWorklet.addModule" in source and "AudioWorklet initialization timed out" not in source:
    source = re.sub(
        r"await\s+([^;\n]*audioWorklet\.addModule\([\s\S]*?\))\s*;",
        r"await withTimeout(\1, 12_000, 'AudioWorklet initialization timed out', { signal: preparationController.signal });",
        source,
        count=1,
    )

if "await createRecordingWriter" not in source:
    reset = re.search(r"pcmChunksRef\.current\s*=\s*\[\]\s*;", source)
    if reset:
        source = source[: reset.end()] + "\n      recordingWriterRef.current = await createRecordingWriter();" + source[reset.end() :]

if "recordingWriterRef.current?.append" not in source:
    push = re.search(r"pcmChunksRef\.current\.push\(([^;]+)\);", source)
    if push:
        expression = push.group(1)
        source = (
            source[: push.end()]
            + f"\n        void recordingWriterRef.current?.append({expression}).catch((error) => console.error('Recording storage write failed', error));"
            + source[push.end() :]
        )

if "setIsPreparing(false);\n      isRecordingRef.current = true" not in source:
    if "isRecordingRef.current = true;" in source:
        source = source.replace("isRecordingRef.current = true;", "setIsPreparing(false);\n      isRecordingRef.current = true;", 1)
    else:
        source = re.sub(r"(set\w*Recording\w*\(true\);)", r"setIsPreparing(false);\n      \1", source, count=1)

start_index = start.start()
catch = re.search(r"}\s*catch\s*\(([^)]+)\)\s*\{", source[start_index:])
if not catch:
    raise RuntimeError("useRecording startup catch not found")
catch_end = start_index + catch.end()
if source.find("setIsPreparing(false);", catch_end, catch_end + 600) < 0:
    cleanup = "\n      setIsPreparing(false);\n      preparationAbortRef.current = null;\n      await recordingWriterRef.current?.abort().catch(() => undefined);\n      recordingWriterRef.current = null;\n      cleanupRecording();\n      audioEngine.stop();"
    source = source[:catch_end] + cleanup + source[catch_end:]

source = source.replace(
    "setIsPreparing(false);\n      isRecordingRef.current = true;",
    "setIsPreparing(false);\n      preparationAbortRef.current = null;\n      isRecordingRef.current = true;",
    1,
)

if "streamedRecordingBlob" not in source:
    blob_match = re.search(
        r"(const\s+(\w*(?:recording|audio)\w*Blob|recordingBlob)\s*=\s*new\s+Blob\([\s\S]*?\);)",
        source,
        re.I,
    )
    if blob_match:
        variable = blob_match.group(2)
        extra = f"\n    const streamedRecordingBlob = await recordingWriterRef.current?.finalize().catch((error) => {{\n      console.warn('Incremental recording finalization failed; using compatibility data.', error);\n      return null;\n    }});\n    recordingWriterRef.current = null;\n    const durableRecordingBlob = streamedRecordingBlob && streamedRecordingBlob.size > 0 ? streamedRecordingBlob : {variable};"
        split = blob_match.end()
        source = source[:split] + extra + source[split:]
        tail_start = split + len(extra)
        tail = re.sub(rf"\b{re.escape(variable)}\b", "durableRecordingBlob", source[tail_start:])
        source = source[:tail_start] + tail

if re.search(r"\breturn\s*\{[\s\S]*?isRecording", source) and not re.search(r"\breturn\s*\{[\s\S]*?isPreparing", source):
    source = re.sub(r"(return\s*\{\s*\n\s*isRecording,)", r"return {\n    isPreparing,\n    isRecording,", source, count=1)
write(recording_path, source)

record_button = "src/components/metronome/RecordButton.tsx"
source = read(record_button)
if "isPreparing" not in source:
    source = re.sub(r"(isRecording\s*:\s*boolean;)", r"\1\n  isPreparing?: boolean;", source, count=1)
    source = re.sub(r"(isRecording\s*,)", r"isRecording, isPreparing = false,", source, count=1)
    if "disabled=" in source:
        source = re.sub(r"disabled=\{([^}]+)\}", r"disabled={isPreparing || \1}", source, count=1)
    else:
        source = source.replace("<button", "<button disabled={isPreparing}", 1)
    source = source.replace(
        "isRecording ? 'STOP REC' : 'RECORD'",
        "isPreparing ? 'PREPARING…' : isRecording ? 'STOP REC' : 'RECORD'",
    )
    button = source.find("<button")
    end = source.find(">", button)
    if button >= 0 and "aria-label" not in source[button:end]:
        source = source[: button + 7] + "\n      aria-label={isPreparing ? 'Preparing microphone' : isRecording ? 'Stop recording' : 'Start recording'}" + source[button + 7 :]
write(record_button, source)

home = "src/pages/HomePage.tsx"
source = read(home)
if "isPreparing" not in source:
    source = re.sub(
        r"(\{[\s\S]{0,500}?)(isRecording,)",
        lambda match: match.group(1) + "isPreparing,\n    " + match.group(2),
        source,
        count=1,
    )
    source = re.sub(r"(<RecordButton\b)", r"\1 isPreparing={isPreparing}", source, count=1)
write(home, source)

# Preserve user data on database startup failure.
database = "src/store/db.ts"
source = read(database)
if "indexedDB.deleteDatabase" in source:
    pattern = r"\n\s*(?:const|let)\s+\w+\s*=\s*indexedDB\.deleteDatabase\([^;]+\);[\s\S]{0,1800}?(?=\n\s*}\s*(?:catch|finally|$)|\n\s*throw\s)"
    replacement = "\n    throw new Error('Poly Pro could not open local storage safely. Your recordings were not deleted. Export data from another browser session or explicitly reset storage from Settings.');\n"
    updated, count = re.subn(pattern, replacement, source, count=1)
    if count:
        source = updated
    else:
        source = source.replace(
            "indexedDB.deleteDatabase(",
            "(() => { throw new Error('Poly Pro could not open local storage safely. Your recordings were not deleted.'); })();\n    indexedDB.deleteDatabase(",
            1,
        )
write(database, source)

# Never force-reload an active recording/session when a worker activates.
main = "src/main.tsx"
source = read(main)
source = source.replace(
    "window.location.reload();",
    "window.dispatchEvent(new CustomEvent('poly-pro:update-ready'));",
    1,
)
write(main, source)

# Accessible names for core icon controls.
for path, labels in [
    ("src/components/metronome/BpmControl.tsx", ["Decrease tempo", "Increase tempo"]),
    ("src/components/metronome/MeterControl.tsx", ["Previous time signature", "Next time signature"]),
]:
    source = read(path)
    position = 0
    for label in labels:
        match = re.search(r"<button\b", source[position:])
        if not match:
            break
        begin = position + match.start()
        end = source.find(">", begin)
        if "aria-label=" not in source[begin:end]:
            source = source[: begin + 7] + f' aria-label="{label}"' + source[begin + 7 :]
            position = end + len(label) + 14
        else:
            position = end + 1
    write(path, source)

path = "src/components/ui/Toggle.tsx"
source = read(path)
if "aria-label=" not in source:
    index = source.find("<button")
    if index >= 0:
        source = source[: index + 7] + ' aria-label="Toggle setting"' + source[index + 7 :]
write(path, source)

path = "src/components/metronome/Dial.tsx"
source = read(path)
index = source.find("<canvas")
if index >= 0:
    end = source.find(">", index)
    if "aria-label" not in source[index:end]:
        additions = " role=\"button\" tabIndex={0} aria-label={`Set tempo. Current tempo ${bpm} BPM`} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onClick?.(); } }}"
        source = source[: index + 7] + additions + source[index + 7 :]
write(path, source)

# Convert HelpTip's nested button into non-focusable descriptive content.
for candidate in (ROOT / "src").rglob("*.tsx"):
    source = candidate.read_text()
    if "function HelpTip" not in source and "const HelpTip" not in source:
        continue
    starts = [value for value in [source.find("function HelpTip"), source.find("const HelpTip")] if value >= 0]
    start = min(starts)
    segment = source[start:]
    opening = segment.find("<button")
    closing = segment.find("</button>", opening)
    if opening < 0 or closing < 0:
        continue
    absolute_open = start + opening
    absolute_close = start + closing
    open_end = source.find(">", absolute_open)
    open_tag = source[absolute_open : open_end + 1]
    new_tag = re.sub(
        r"\s+(onClick|onPointerDown|onKeyDown|aria-expanded|type|disabled)=\{?[^\s>]+\}?",
        "",
        open_tag,
    )
    new_tag = new_tag.replace("<button", "<span").replace("tabIndex={0}", "")
    if "title=" not in new_tag:
        new_tag = new_tag[:-1] + ' title="More information">'
    source = source[:absolute_open] + new_tag + source[open_end + 1 : absolute_close] + "</span>" + source[absolute_close + 9 :]
    write(str(candidate.relative_to(ROOT)), source)

# Correct known muted-copy contrast failures.
css_candidates = [path for path in (ROOT / "src").rglob("*.css") if "@tailwind" in path.read_text()]
if not css_candidates:
    raise RuntimeError("Tailwind entry stylesheet not found")
css_path = css_candidates[0]
source = css_path.read_text()
if "WCAG AA contrast corrections" not in source:
    source += """

/* WCAG AA contrast corrections for muted interface copy on the dark theme. */
.text-text-muted { color: #b8bcc5 !important; }
.text-text-secondary { color: #d0d3da !important; }
"""
write(str(css_path.relative_to(ROOT)), source)

# Explicit navigation remains authoritative; accidental horizontal page swipe is disabled.
swipe_path = "src/components/ui/SwipeNavigation.tsx"
source = read(swipe_path)
if "PAGE_SWIPE_DISABLED" not in source:
    lines = source.splitlines()
    last_import = 0
    inside_import = False
    for index, line in enumerate(lines):
        if line.strip().startswith("import "):
            inside_import = True
        if inside_import:
            last_import = index
        if inside_import and ";" in line:
            inside_import = False
    lines.insert(last_import + 1, "\nconst PAGE_SWIPE_DISABLED = true;")
    source = "\n".join(lines) + "\n"
    source = re.sub(
        r"if\s*\(\s*Math\.abs\(([^)]+)\)\s*>",
        r"if (!PAGE_SWIPE_DISABLED && Math.abs(\1) >",
        source,
        count=1,
    )
write(swipe_path, source)

# Permanent browser, offline, accessibility, and tempo regression coverage.
package_path = ROOT / "package.json"
package = json.loads(package_path.read_text())
package.setdefault("scripts", {})["test:browser"] = "playwright test"
package.setdefault("scripts", {})["test:all"] = "npm run lint && npm run test:run && npm run build && npm run test:browser"
package.setdefault("devDependencies", {})["@playwright/test"] = "^1.55.0"
package.setdefault("devDependencies", {})["axe-core"] = "^4.10.3"
write("package.json", json.dumps(package, indent=2) + "\n")

write(
    "playwright.config.ts",
    '''import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  retries: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173/poly-pro/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173/poly-pro/',
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: 'mobile-chromium', use: { ...devices['Pixel 7'] } }],
});
''',
)
write(
    "tests/e2e/app.spec.ts",
    '''import { expect, test } from '@playwright/test';
import axe from 'axe-core';

test('boots, navigates, and survives offline reload', async ({ page, context }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Home', exact: true })).toBeVisible();
  for (const pageName of ['Projects', 'Progress', 'Home']) {
    await page.getByRole('button', { name: pageName, exact: true }).click();
    await expect(page.locator('button[aria-current="page"]').filter({ hasText: pageName })).toBeVisible();
  }
  await page.reload();
  await expect(page.getByRole('button', { name: 'Home', exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Home', exact: true })).toBeVisible();
  await context.setOffline(false);
});

test('opening the BPM keypad never reverts an external tempo change', async ({ page }) => {
  await page.goto('./');
  const tap = page.getByRole('button', { name: /TAP/ });
  for (let index = 0; index < 5; index += 1) {
    await tap.click();
    if (index < 4) await page.waitForTimeout(600);
  }
  await page.locator('canvas').first().click({ position: { x: 120, y: 120 } });
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const displayed = Number(await dialog.locator('.font-mono.text-4xl').innerText());
  expect(displayed).toBeGreaterThan(95);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await page.locator('canvas').first().click({ position: { x: 120, y: 120 } });
  await expect(page.getByRole('dialog').locator('.font-mono.text-4xl')).toHaveText(String(displayed));
});

test('home has no serious or critical axe violations', async ({ page }) => {
  await page.goto('./');
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async () => {
    const result = await (window as typeof window & { axe: typeof axe }).axe.run(document);
    return result.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  });
  expect(violations).toEqual([]);
});
''',
)
write(
    ".github/workflows/browser.yml",
    '''name: Browser Validation

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  browser:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: npx playwright install --with-deps chromium
      - run: npm run test:browser
''',
)
write(
    "docs/PRODUCTION-HARDENING.md",
    '''# Production hardening

This release addresses the browser audit's confirmed defects and the architectural failure modes behind them.

- BPM keypad initialization no longer emits stale tempo values.
- Recording preparation is cancellable and bounded by microphone/worklet timeouts.
- PCM chunks are written incrementally to OPFS when available, with an explicit compatibility fallback.
- Post-session analysis uses a Web Worker with a main-thread fallback.
- IndexedDB startup never deletes user data automatically.
- Service-worker activation no longer forces an unsafe page reload.
- Core controls have accessible names, keyboard behavior, and corrected contrast.
- Accidental horizontal page swipes are disabled; explicit navigation remains authoritative.
- Unit and Chromium regression coverage is permanent in CI.
''',
)

print("Production hardening transformation completed.")
