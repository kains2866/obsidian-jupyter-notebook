import json
import subprocess
import sys
import threading
import queue
import unittest
import psutil
import tempfile
import os
from pathlib import Path

class BridgeTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.proc = subprocess.Popen([sys.executable, str(Path(__file__).parents[1] / 'python/kernel_bridge.py')], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        self.events = queue.Queue()
        threading.Thread(target=lambda: [self.events.put(json.loads(line)) for line in self.proc.stdout], daemon=True).start()
        self.send('start', python=sys.executable, cwd=self.directory.name)
        self.assertEqual(self.until('ready')[-1]['event'], 'ready')

    def tearDown(self):
        if self.proc.poll() is None:
            self.proc.stdin.close()
            self.proc.wait(timeout=15)
        if not self.proc.stdin.closed:
            try:
                self.proc.stdin.close()
            except BrokenPipeError:
                pass
        self.proc.stdout.close()
        self.proc.stderr.close()
        self.directory.cleanup()

    def send(self, op, **kwargs):
        self.proc.stdin.write(json.dumps(dict(id='execute' if op == 'input_reply' else op, op=op, **kwargs)) + '\n')
        self.proc.stdin.flush()

    def until(self, event):
        results = []
        while True:
            item = self.events.get(timeout=30)
            results.append(item)
            if item['event'] == event:
                return results

    def test_execution_outputs_and_restart(self):
        self.send('execute', code='answer=40\nprint("hello")')
        events = self.until('result')
        self.assertTrue(any(e.get('output', {}).get('text') == 'hello\n' for e in events))
        self.send('execute', code='answer + 2')
        self.assertTrue(any(e.get('output', {}).get('data', {}).get('text/plain') == '42' for e in self.until('result')))
        self.send('execute', code='1/0')
        self.assertEqual(self.until('result')[-1]['status'], 'error')
        self.send('execute', code='from IPython.display import display, Image\ndisplay(Image(data=b"png", format="png"))')
        self.assertTrue(any('image/png' in e.get('output', {}).get('data', {}) for e in self.until('result')))
        self.send('restart')
        self.until('ready')
        self.send('execute', code='answer')
        self.assertEqual(self.until('result')[-1]['status'], 'error')

    def test_input_protocol_ignores_stale_tokens_and_accepts_blank_unicode(self):
        self.send('execute', code='a=input("名字: ")\nb=input("Blank: ")\nprint(repr(a),repr(b))')
        first = self.until('input_request')[-1]
        self.assertEqual(first['prompt'], '名字: ')
        self.assertFalse(first['password'])
        self.send('input_reply', token='stale', value='wrong')
        self.send('input_reply', token=first['token'], value='你好')
        second = self.until('input_request')[-1]
        self.assertNotEqual(first['token'], second['token'])
        self.send('input_reply', token=first['token'], value='wrong')
        self.send('input_reply', token=second['token'], value='')
        events = self.until('result')
        self.assertEqual(events[-1]['status'], 'ok')
        self.assertTrue(any("'你好' ''" in e.get('output', {}).get('text', '') for e in events))

    def test_invalid_kernel_interpreter_reports_error(self):
        process = subprocess.Popen(
            [sys.executable, str(Path(__file__).parents[1] / 'python/kernel_bridge.py')],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        try:
            process.stdin.write(json.dumps(dict(id='bad', op='start', python='/nonexistent/kernel-python')) + '\n')
            process.stdin.flush()
            event = json.loads(process.stdout.readline())
            self.assertEqual(event['id'], 'bad')
            self.assertEqual(event['event'], 'error')
            self.assertIn('kernel-python', event['message'])
        finally:
            process.stdin.close()
            process.wait(timeout=10)
            process.stdout.close()
            process.stderr.close()

    def test_cwd_and_eof_during_non_interruptible_execution(self):
        self.send('execute', code='import os\nprint(os.getcwd())')
        outputs = [e.get('output', {}).get('text', '').strip() for e in self.until('result')]
        self.assertTrue(any(os.path.normcase(os.path.realpath(value)) == os.path.normcase(os.path.realpath(self.directory.name)) for value in outputs if value))
        self.send('execute', code='import signal,time\nsignal.signal(signal.SIGINT,signal.SIG_IGN)\nprint("running",flush=True)\ntime.sleep(60)')
        self.until('output')
        children = psutil.Process(self.proc.pid).children(recursive=True)
        self.proc.stdin.close()
        self.proc.wait(timeout=5)
        self.assertTrue(all(not process.is_running() for process in children))

    def test_global_errors_and_oversized_input_cleanup(self):
        self.proc.stdin.write('{broken json\n')
        self.proc.stdin.flush()
        error = self.until('error')[-1]
        self.assertEqual(error['id'], '')
        self.send('execute', code='import signal,time\nsignal.signal(signal.SIGINT,signal.SIG_IGN)\nprint("running",flush=True)\ntime.sleep(60)')
        self.until('output')
        children = psutil.Process(self.proc.pid).children(recursive=True)
        try:
            self.proc.stdin.write(' ' * (9 * 1024 * 1024) + '\n')
            self.proc.stdin.flush()
        except BrokenPipeError:
            pass
        self.assertIn('8 MiB', self.until('error')[-1]['message'])
        self.proc.wait(timeout=5)
        self.assertTrue(all(not process.is_running() for process in children))

    def test_interrupt_and_shutdown(self):
        self.send('execute', code='print("running", flush=True)\nwhile True: pass')
        self.until('output')
        self.send('interrupt')
        while True:
            event = self.events.get(timeout=30)
            if event['event'] == 'error':
                self.fail('Bridge reported an error during interrupt: ' + event.get('message', ''))
            if event['event'] == 'result':
                self.assertEqual(event['status'], 'error')
                break
        children = psutil.Process(self.proc.pid).children(recursive=True)
        self.send('shutdown')
        self.until('stopped')
        self.proc.wait(timeout=10)
        self.assertEqual(self.proc.returncode, 0)
        self.assertTrue(all(not process.is_running() for process in children))

if __name__ == '__main__':
    unittest.main()
