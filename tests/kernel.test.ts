import { expect, test } from 'vitest';
import { KernelClient } from '../src/kernel';
test('a missing bridge interpreter rejects start and closes safely', async () => {
  const client = new KernelClient('/nonexistent/python', '/nonexistent/python', '/bridge.py');
  await expect(client.start()).rejects.toThrow();
  await client.close();
});
import { resolve } from 'node:path';
test('client streams real kernel output, shares variables, and interrupts execution', async () => {
  const python = resolve('.venv/bin/python');
  const client = new KernelClient(python, python, resolve('python/kernel_bridge.py'), resolve('.'));
  try {
    await client.start();
    const outputs: Record<string, unknown>[] = [];
    await client.execute('x=21', output => outputs.push(output));
    const result = await client.execute('x*2', output => outputs.push(output));
    expect(result.status).toBe('ok');
    expect(outputs.some(output => (output.data as Record<string, unknown> | undefined)?.['text/plain'] === '42')).toBe(true);
    let notifyStarted!: () => void;
    const started = new Promise<void>(resolve => { notifyStarted = resolve; });
    const execution = client.execute('import time\nprint("running", flush=True)\ntime.sleep(60)', () => notifyStarted());
    await started;
    await client.interrupt();
    expect((await execution).status).toBe('error');
    await client.restart();
    expect((await client.execute('x', () => {})).status).toBe('error');
  } finally { await client.close(); }
}, 30000);
test('restart forces recovery from a kernel ignoring interrupts', async () => {
  const python = resolve('.venv/bin/python');
  const client = new KernelClient(python, python, resolve('python/kernel_bridge.py'));
  await client.start();
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const running = client.execute('import signal,time\nsignal.signal(signal.SIGINT, signal.SIG_IGN)\nprint("started",flush=True)\ntime.sleep(60)', () => started());
  const rejected = expect(running).rejects.toThrow('restarted');
  await ready;
  const before = Date.now();
  await client.restart();
  expect(Date.now() - before).toBeLessThan(5000);
  await rejected;
  expect((await client.execute('2+2', () => {})).status).toBe('ok');
  await client.close();
}, 15000);
test('oversized request rejects promptly and closes bridge', async () => {
  const python = resolve('.venv/bin/python');
  const client = new KernelClient(python, python, resolve('python/kernel_bridge.py'));
  await client.start();
  await expect(client.execute(' '.repeat(9 * 1024 * 1024), () => {})).rejects.toThrow('8 MiB');
  await client.close();
}, 10000);
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
async function withFixture(body: string, run: (client: KernelClient) => Promise<void>): Promise<void> {
  const directory = mkdtempSync(resolve(tmpdir(), 'ipynb-bridge-'));
  const bridge = resolve(directory, 'bridge.py');
  writeFileSync(bridge, `import sys,json\nfor line in sys.stdin:\n r=json.loads(line)\n ${body.replaceAll('\n', '\n ')}\n`);
  const client = new KernelClient(resolve('.venv/bin/python'), 'python', bridge);
  try { await run(client); } finally { await client.close(); rmSync(directory, { recursive: true }); }
}
for (const [name, response, message] of [
  ['global error', 'print(json.dumps(dict(event="error",message="global failure")),flush=True)', 'global failure'],
  ['malformed JSON', 'print("not json",flush=True)', 'Unexpected'],
  ['invalid event', 'print(json.dumps(dict(id=r["id"],event="wrong")),flush=True)', 'Invalid kernel event'],
  ['request error', 'print(json.dumps(dict(id=r["id"],event="error",message="request failure")),flush=True)', 'request failure'],
  ['exit', 'sys.exit(7)', 'exited'],
] as const) {
  test(`rejects ${name}`, async () => { await withFixture(response, async client => { await expect(client.start()).rejects.toThrow(message); }); });
}
test('closed and duplicate operations reject and callbacks surface errors', async () => {
  await withFixture('print(json.dumps(dict(id="unknown",event="ready")),flush=True)\nprint(json.dumps(dict(id=r["id"],event="output",output={"output_type":"stream","text":"ok"}) if r["op"]=="execute" else dict(id=r["id"],event="ready")),flush=True)', async client => {
    await client.start();
    await expect(client.start()).rejects.toThrow('already started');
    await expect(client.execute('x', () => { throw new Error('callback failed'); })).rejects.toThrow('callback failed');
    await client.close();
    await client.close();
    await expect(client.start()).rejects.toThrow('closed');
    await expect(client.restart()).rejects.toThrow('closed');
    await expect(client.execute('x', () => {})).rejects.toThrow('not running');
    await expect(client.interrupt()).rejects.toThrow('not running');
  });
});
test('normalizes absent execution fields and missing error messages', async () => {
  await withFixture('print(json.dumps(dict(id=r["id"],event="result") if r["op"]=="execute" else dict(id=r["id"],event="ready")),flush=True)', async client => {
    await client.start();
    expect(await client.execute('', () => {})).toEqual({ execution_count: null, status: 'error' });
  });
  await withFixture('print(json.dumps(dict(id=r["id"],event="error")),flush=True)', async client => {
    await expect(client.start()).rejects.toThrow('Kernel error');
  });
  await withFixture('print(json.dumps(dict(event="error")),flush=True)', async client => {
    await expect(client.start()).rejects.toThrow('Kernel protocol error');
  });
});
test('optional output callback and missing payload do not settle requests', async () => {
  await withFixture('print(json.dumps(dict(id=r["id"],event="output",output={"text":"ignored"})),flush=True)\nprint(json.dumps(dict(id=r["id"],event="ready")),flush=True)', async client => { await client.start(); });
  await withFixture('print(json.dumps(dict(id=r["id"],event="output")),flush=True)', async client => { await expect(client.start()).rejects.toThrow('Invalid kernel event'); });
});
