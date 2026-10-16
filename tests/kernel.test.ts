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
test('real stdin supports Unicode, blank input, sequential prompts and passwords', async () => {
 const python=resolve('.venv/bin/python'); const client=new KernelClient(python,python,resolve('python/kernel_bridge.py'));
 try { await client.start(); const prompts: unknown[]=[]; const values=['你好','', 'secret']; const outputs: Record<string,unknown>[]=[];
 const result=await client.execute('a=input("Name: ")\nb=input("Blank: ")\nimport getpass\nc=getpass.getpass("Password: ")\nprint(a,repr(b),len(c))',o=>outputs.push(o),async request=>{prompts.push(request);return values.shift()!;});
 expect(result.status).toBe('ok'); expect(prompts).toEqual([{prompt:'Name: ',password:false},{prompt:'Blank: ',password:false},{prompt:'Password: ',password:true}]); expect(outputs.some(o=>String(o.text).includes("你好 '' 6"))).toBe(true);
 } finally {await client.close();}
},20000);
test('cancelled stdin interrupts and pending input closes on interrupt and close',async()=>{
 const python=resolve('.venv/bin/python');const client=new KernelClient(python,python,resolve('python/kernel_bridge.py'));
 try {await client.start();expect((await client.execute('input("cancel")',()=>{},async()=>null)).status).toBe('error');
 for(const action of ['interrupt','close'] as const){let shown!:()=>void;const ready=new Promise<void>(r=>shown=r);let aborted=false;
 const run=client.execute('input("wait")',()=>{},async(_request,signal)=>{shown();return await new Promise<null>(r=>signal.addEventListener('abort',()=>{aborted=true;r(null);}));});
 const settled=run.catch(()=>null);await ready;await client[action]();await settled;expect(aborted).toBe(true);}
 }finally{await client.close();}
},20000);
test('stdin without a callback cancels, restart aborts a stale reply',async()=>{
 const python=resolve('.venv/bin/python');const client=new KernelClient(python,python,resolve('python/kernel_bridge.py'));
 try {await client.start();expect((await client.execute('input("missing")',()=>{})).status).toBe('error');
 let shown!:()=>void;const ready=new Promise<void>(r=>shown=r);let answer!:(value:string)=>void;let signal!:AbortSignal;
 const running=client.execute('input("stale")',()=>{},async(_request,inputSignal)=>{signal=inputSignal;shown();return new Promise<string>(r=>answer=r);});const rejected=expect(running).rejects.toThrow('restarted');await ready;await client.restart();await rejected;expect(signal.aborted).toBe(true);answer('stale');
 const prompts: string[]=[];expect((await client.execute('print(input("fresh"))',()=>{},async request=>{prompts.push(request.prompt);return 'fresh';})).status).toBe('ok');expect(prompts).toEqual(['fresh']);
 }finally{await client.close();}
},20000);
test('input handler failure rejects execution without exposing handler details',async()=>{
 await withFixture('print(json.dumps(dict(id=r["id"],event="input_request",token="one",prompt="Prompt",password=False) if r["op"]=="execute" else dict(id=r["id"],event="ready")),flush=True)',async client=>{
 await client.start();await expect(client.execute('',()=>{},async()=>{throw new Error('private input');})).rejects.toThrow('Kernel error');expect(client.isAlive).toBe(false);
 });
});
test('failed cancellation interrupt rejects execution instead of leaving it pending',async()=>{
 await withFixture('print(json.dumps(dict(id=r["id"],event="input_request",token="one",prompt="Prompt",password=False) if r["op"]=="execute" else dict(id=r["id"],event="error",message="interrupt failed") if r["op"]=="interrupt" else dict(id=r["id"],event="ready")),flush=True)',async client=>{
 await client.start();await expect(client.execute('',()=>{},async()=>null)).rejects.toThrow('Kernel error');expect(client.isAlive).toBe(false);
 });
});
test('overlapping input requests fail protocol and abort the existing dialog',async()=>{
 await withFixture('print(json.dumps(dict(id=r["id"],event="ready")),flush=True) if r["op"]!="execute" else [print(json.dumps(dict(id=r["id"],event="input_request",token=token,prompt="Prompt",password=False)),flush=True) for token in ["one","two"]]',async client=>{
 await client.start();let calls=0;let signal!:AbortSignal;await expect(client.execute('',()=>{},async(_request,s)=>{calls++;signal=s;return await new Promise<null>(resolve=>s.addEventListener('abort',()=>resolve(null)));})).rejects.toThrow('Invalid kernel event');expect(calls).toBe(1);expect(signal.aborted).toBe(true);
 });
});
