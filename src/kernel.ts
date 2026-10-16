import {setTimeout,clearTimeout} from 'node:timers';
import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

export interface KernelInputRequest { prompt: string; password: boolean }
type InputHandler = (request: KernelInputRequest, signal: AbortSignal) => Promise<string | null>;
type Output = Record<string, unknown>;
type Reply = { id: string; event: string; output?: Output; execution_count?: number | null; status?: string; message?: string; prompt?: string; password?: boolean; token?: string };
type Pending = { resolve: (reply: Reply) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>; onOutput?: (output: Output) => void; onInput?: InputHandler; controller?: AbortController; inputToken?: string };

export class KernelClient {
  onStateChange?: () => void;
  get isAlive(): boolean { return !!this.process && this.process.exitCode === null && this.process.signalCode === null; }
  private process: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<string, Pending>();
  private sequence = 0;
  private buffer = '';
  private diagnostics = '';
  private executionQueue: Promise<unknown> = Promise.resolve();
  private closed = false;
  private generation = 0;
  private stopping: Promise<void> | null = null;
  constructor(private bridgePython: string, private kernelPython: string, private bridgePath: string, private cwd?: string) {}

  async start(): Promise<void> {
    if (this.closed) throw new Error('Kernel client is closed');
    if (this.process) throw new Error('Kernel already started');
    const child = spawn(this.bridgePython, ['-u', this.bridgePath], { shell: false, stdio: 'pipe' });
    this.process = child;
    this.buffer = '';
    this.diagnostics = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.on('error', error => { if (this.process !== child) return; this.process = null; this.onStateChange?.(); this.fail(error); });
    child.stdin.on('error', error => { if (this.process === child) this.fail(error); });
    child.on('exit', (code, signal) => {
      if (this.process !== child) return;
      this.process = null;
      this.onStateChange?.();
      this.fail(new Error(`Kernel bridge exited (${code ?? signal}). ${this.diagnostics}`));
    });
    child.stderr.on('data', chunk => { if (this.process !== child) return; this.diagnostics = (this.diagnostics + String(chunk)).slice(-8192); });
    child.stdout.on('data', chunk => { if (this.process === child) this.receive(String(chunk)); });
    await this.request('start', { python: this.kernelPython, ...(this.cwd ? { cwd: this.cwd } : {}) });
  }

  execute(code: string, onOutput: (output: Output) => void, onInput?: InputHandler): Promise<{ execution_count: number | null; status: string }> {
    const generation = this.generation;
    const execution = this.executionQueue.then(async () => {
      if (generation !== this.generation) throw new Error('Kernel restarted');
      const reply = await this.request('execute', { code }, onOutput, 24 * 60 * 60 * 1000, onInput);
      return { execution_count: reply.execution_count ?? null, status: reply.status ?? 'error' };
    });
    this.executionQueue = execution.catch(() => undefined);
    return execution;
  }

  async interrupt(): Promise<void> {
    for (const pending of this.pending.values()) pending.controller?.abort();
    await this.request('interrupt'); }
  async restart(): Promise<void> {
    if (this.closed) throw new Error('Kernel client is closed');
    this.generation += 1;
    this.fail(new Error('Kernel restarted'));
    this.executionQueue = Promise.resolve();
    await this.stopProcess();
    await this.start();
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.generation += 1;
    this.fail(new Error('Kernel client closed'));
    await this.stopProcess();
  }

  private async stopProcess(): Promise<void> {
    const child = this.process;
    if (!child) { await this.stopping; return; }
    this.process = null;
    this.onStateChange?.();
    if (child.exitCode !== null || child.signalCode !== null) return;
    const stopping = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const error = new Error('Kernel bridge did not clean up within 3 seconds');
        if (process.platform === 'win32' && child.pid) {
          execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {timeout: 10000, windowsHide: true}, cleanupError => {
            reject(cleanupError ? new Error(`${error.message}: ${cleanupError.message}`) : error);
          });
        } else { child.kill('SIGKILL'); reject(error); }
      }, 3000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
      // Windows SIGTERM uses TerminateProcess and skips Python's finally cleanup.
      if (process.platform !== 'win32') child.kill('SIGTERM');
      child.stdin.end();
    });
    this.stopping = stopping;
    try { await stopping; } finally { if (this.stopping === stopping) this.stopping = null; }
  }

  private protocolFailure(error: Error): void {
    this.fail(error);
    void this.stopProcess().catch(cleanupError => { this.diagnostics = String(cleanupError); });
  }

  private request(op: string, payload: Output = {}, onOutput?: (output: Output) => void, timeout = 45000, onInput?: InputHandler): Promise<Reply> {
    const child = this.process;
    if (!child || child.exitCode !== null || child.signalCode !== null || (this.closed && op !== 'shutdown' && op !== 'interrupt')) return Promise.reject(new Error('Kernel bridge is not running'));
    const id = String(++this.sequence);
    const message = JSON.stringify({ id, op, ...payload }) + '\n';
    if (Buffer.byteLength(message, 'utf8') > 8 * 1024 * 1024) {
      const error = new Error('Request exceeds 8 MiB limit');
      this.protocolFailure(error);
      return Promise.reject(error);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.process === child) this.protocolFailure(new Error(`Kernel ${op} timed out`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer, onOutput, onInput, ...(op === 'execute' ? {controller: new AbortController()} : {}) });
      child.stdin.write(message, error => {
        if (error) this.fail(error);
      });
    });
  }

  private receive(chunk: string): void {
    this.buffer += chunk;
    if (this.buffer.length > 32 * 1024 * 1024) {
      this.protocolFailure(new Error('Kernel output exceeded 32 MiB protocol limit'));
      return;
    }
    let newline: number;
    while ((newline = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      try {
        const reply = JSON.parse(line) as Reply;
        if (!reply.id && reply.event === 'error') throw new Error(reply.message ?? 'Kernel protocol error');
        const pending = this.pending.get(reply.id);
        if (!pending) continue;
        if (reply.event === 'input_request') {
          if (!pending.controller || pending.inputToken !== undefined || typeof reply.token !== 'string' || typeof reply.prompt !== 'string' || typeof reply.password !== 'boolean') throw new Error('Invalid kernel event');
          pending.inputToken = reply.token;
          void this.answerInput(reply.id, pending, reply as Reply & {token: string; prompt: string; password: boolean});
          continue;
        }
        if (reply.event === 'output' && reply.output) { pending.onOutput?.(reply.output); continue; }
        if (!['ready', 'result', 'error', 'stopped'].includes(reply.event)) throw new Error('Invalid kernel event');
        clearTimeout(pending.timer);
        this.pending.delete(reply.id);
        pending.controller?.abort();
        if (reply.event === 'error') pending.reject(new Error(reply.message ?? 'Kernel error'));
        else pending.resolve(reply);
      } catch (error) {
        this.protocolFailure(error instanceof Error ? error : new Error(String(error)));
        return;
      }
    }
  }

  private async answerInput(id: string, pending: Pending, reply: Reply & {token: string; prompt: string; password: boolean}): Promise<void> {
    const signal = pending.controller!.signal;
    if (signal.aborted) return;
    let value: string | null = null;
    try { value = await pending.onInput?.({prompt: reply.prompt, password: reply.password}, signal) ?? null; }
    catch {
      if (!signal.aborted && this.pending.get(id) === pending) this.protocolFailure(new Error('Kernel error'));
      return;
    }
    if (signal.aborted || this.pending.get(id) !== pending || pending.inputToken !== reply.token) return;
    pending.inputToken = undefined;
    if (typeof value !== 'string' || value.length > 65536) {
      try { await this.interrupt(); }
      catch { if (this.pending.get(id) === pending) this.protocolFailure(new Error('Kernel error')); }
      return;
    }
    const child = this.process;
    if (child) child.stdin.write(JSON.stringify({id, op: 'input_reply', token: reply.token, value}) + '\n', error => { if (error) this.fail(error); });
  }

  private fail(error: Error): void {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.controller?.abort(); pending.reject(error); }
    this.pending.clear();
  }
}
