const MAX_MEMORY_RECORDING_BYTES = 512 * 1024 * 1024;
const RECORDING_DIRECTORY = 'recording-staging';
const MANAGED_FILE_PREFIX = 'recording-';

export type RecordingSinkKind = 'opfs' | 'memory';

export interface RecordingSink {
  readonly kind: RecordingSinkKind;
  readonly byteLength: number;
  append(samples: Float32Array): void;
  finalize(): Promise<Blob>;
  discard(): Promise<void>;
  /** Release transient resources after the finalized Blob/File is durable. */
  release(): Promise<void>;
}

function toOwnedArrayBuffer(samples: Float32Array): ArrayBuffer {
  return samples.slice().buffer as ArrayBuffer;
}

class MemoryRecordingSink implements RecordingSink {
  readonly kind = 'memory' as const;
  private chunks: ArrayBuffer[] = [];
  private bytes = 0;
  private error: Error | null = null;
  private finalized = false;

  get byteLength(): number {
    return this.bytes;
  }

  append(samples: Float32Array): void {
    if (this.finalized || this.error) return;
    const buffer = toOwnedArrayBuffer(samples);
    if (this.bytes + buffer.byteLength > MAX_MEMORY_RECORDING_BYTES) {
      this.error = new Error(
        'This browser cannot stream recordings to disk and the in-memory safety limit was reached.',
      );
      return;
    }
    this.chunks.push(buffer);
    this.bytes += buffer.byteLength;
  }

  async finalize(): Promise<Blob> {
    if (this.finalized) throw new Error('Recording sink was already finalized');
    this.finalized = true;
    if (this.error) throw this.error;
    if (this.bytes === 0) throw new Error('No audio samples were captured');

    const blob = new Blob(this.chunks, { type: 'application/octet-stream' });
    this.chunks = [];
    return blob;
  }

  async discard(): Promise<void> {
    this.finalized = true;
    this.chunks = [];
    this.bytes = 0;
  }

  async release(): Promise<void> {
    this.chunks = [];
  }
}

interface StorageManagerWithDirectory extends StorageManager {
  getDirectory(): Promise<FileSystemDirectoryHandle>;
}

class OpfsRecordingSink implements RecordingSink {
  readonly kind = 'opfs' as const;
  private writeQueue: Promise<void> = Promise.resolve();
  private writeError: Error | null = null;
  private bytes = 0;
  private closed = false;
  private finalized = false;

  private constructor(
    private readonly directory: FileSystemDirectoryHandle,
    private readonly fileName: string,
    private readonly handle: FileSystemFileHandle,
    private readonly writable: FileSystemWritableFileStream,
  ) {}

  static async create(): Promise<OpfsRecordingSink> {
    const storage = navigator.storage as StorageManagerWithDirectory;
    const root = await storage.getDirectory();
    const directory = await root.getDirectoryHandle(RECORDING_DIRECTORY, { create: true });
    const fileName = `${MANAGED_FILE_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.pcm`;
    const handle = await directory.getFileHandle(fileName, { create: true });
    const writable = await handle.createWritable({ keepExistingData: false });
    return new OpfsRecordingSink(directory, fileName, handle, writable);
  }

  get byteLength(): number {
    return this.bytes;
  }

  append(samples: Float32Array): void {
    if (this.finalized || this.closed || this.writeError) return;
    const buffer = toOwnedArrayBuffer(samples);
    this.bytes += buffer.byteLength;

    this.writeQueue = this.writeQueue.then(async () => {
      if (!this.closed) await this.writable.write(buffer);
    }).catch((error: unknown) => {
      this.writeError = error instanceof Error ? error : new Error(String(error));
    });
  }

  async finalize(): Promise<Blob> {
    if (this.finalized) throw new Error('Recording sink was already finalized');
    this.finalized = true;
    await this.writeQueue;
    if (this.writeError) throw this.writeError;
    if (this.bytes === 0) throw new Error('No audio samples were captured');

    await this.writable.close();
    this.closed = true;
    return this.handle.getFile();
  }

  async discard(): Promise<void> {
    await this.writeQueue.catch(() => undefined);
    if (!this.closed) {
      try {
        await this.writable.abort();
      } catch {
        try { await this.writable.close(); } catch {}
      }
      this.closed = true;
    }
    await removeManagedRecordingFile(this.fileName);
  }

  async release(): Promise<void> {
    // The File stored in IndexedDB remains backed by this OPFS entry. Removing
    // it here invalidates later playback and analysis with NotFoundError.
    // Explicit recording deletion owns physical-file cleanup instead.
  }
}

function supportsOpfs(): boolean {
  const storage = navigator.storage as Partial<StorageManagerWithDirectory> | undefined;
  return typeof storage?.getDirectory === 'function';
}

export function getManagedRecordingFileName(blob: Blob | undefined): string | null {
  if (!(blob instanceof File)) return null;
  if (!blob.name.startsWith(MANAGED_FILE_PREFIX) || !blob.name.endsWith('.pcm')) return null;
  return blob.name;
}

export async function removeManagedRecordingFile(fileName: string): Promise<void> {
  if (!supportsOpfs() || !fileName.startsWith(MANAGED_FILE_PREFIX)) return;

  try {
    const storage = navigator.storage as StorageManagerWithDirectory;
    const root = await storage.getDirectory();
    const directory = await root.getDirectoryHandle(RECORDING_DIRECTORY);
    await directory.removeEntry(fileName);
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== 'NotFoundError') {
      console.warn('[recording] Could not remove managed OPFS recording:', error);
    }
  }
}

/**
 * Prefer Origin Private File System so long recordings remain bounded in RAM.
 * Browsers without OPFS use a capped in-memory fallback rather than failing at
 * startup; the fallback still supports a full 30-minute mono Float32 session.
 */
export async function createRecordingSink(): Promise<RecordingSink> {
  if (supportsOpfs()) {
    try {
      return await OpfsRecordingSink.create();
    } catch (error) {
      console.warn('[recording] OPFS staging unavailable; using bounded memory:', error);
    }
  }
  return new MemoryRecordingSink();
}
