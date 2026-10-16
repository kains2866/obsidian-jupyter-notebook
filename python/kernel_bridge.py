"""Bounded JSON Lines transport for a private Jupyter kernel."""
import json
import os
import queue
import signal
import sys
import threading
import uuid
from jupyter_client import KernelManager

MAX_LINE = 8 * 1024 * 1024
write_lock = threading.Lock()
requests = queue.Queue()
input_replies = queue.Queue()
input_lock = threading.Lock()
active_input = None
manager = None
client = None


def emit(request_id, event, **payload):
    with write_lock:
        print(json.dumps(dict(id=request_id, event=event, **payload)), flush=True)


def stop_after_input():
    # os.kill(SIGTERM) on Windows bypasses signal handlers and finally blocks.
    # Shut down through Jupyter before waking the main request loop instead.
    if os.name == 'nt':
        try:
            if manager is not None and manager.has_kernel:
                manager.shutdown_kernel(now=True)
        finally:
            requests.put(None)
    else:
        requests.put(None)
        os.kill(os.getpid(), signal.SIGTERM)


def read_requests():
    global active_input
    pending = b""
    while True:
        while b"\n" not in pending:
            chunk = os.read(sys.stdin.fileno(), 65536)
            if not chunk:
                break
            pending += chunk
            if len(pending) > MAX_LINE:
                emit("", "error", message="Request exceeds 8 MiB limit")
                stop_after_input()
                return
        if b"\n" in pending:
            line, pending = pending.split(b"\n", 1)
        else:
            line, pending = pending, b""
        if not line:
            stop_after_input()
            return
        request = None
        try:
            if len(line) > MAX_LINE:
                raise ValueError('Request exceeds 8 MiB limit')
            request = json.loads(line)
            if not isinstance(request, dict) or not isinstance(request.get('id'), str):
                raise ValueError('Request requires a string id')
            if request.get('op') == 'interrupt':
                if manager is None or not manager.has_kernel:
                    raise ValueError('Kernel is not running')
                with input_lock:
                    active_input = None
                manager.interrupt_kernel()
                emit(request['id'], 'ready')
            elif request.get('op') == 'input_reply':
                value = request.get('value')
                if not isinstance(value, str) or len(value) > 65536:
                    raise ValueError('Invalid input reply')
                input_replies.put(request)
            else:
                requests.put(request)
        except Exception as error:
            emit(request.get('id', '') if isinstance(locals().get('request'), dict) else '', 'error', message=str(error))


def execute(request):
    global active_input
    msg_id = client.execute(request.get('code', ''), allow_stdin=True)
    count = None
    while True:
        try:
            stdin = client.get_stdin_msg(timeout=0)
        except queue.Empty:
            stdin = None
        if stdin and stdin.get('parent_header', {}).get('msg_id') == msg_id and stdin.get('msg_type') == 'input_request':
            token = uuid.uuid4().hex
            with input_lock:
                active_input = (request['id'], token)
            content = stdin['content']
            emit(request['id'], 'input_request', token=token, prompt=content.get('prompt', ''), password=bool(content.get('password', False)))
        while True:
            try:
                response = input_replies.get_nowait()
            except queue.Empty:
                break
            with input_lock:
                if active_input == (response['id'], response.get('token')):
                    client.input(response['value'])
                    active_input = None
        try:
            message = client.get_iopub_msg(timeout=0.05)
        except queue.Empty:
            if not manager.is_alive():
                raise RuntimeError('Kernel exited while executing')
            continue
        if message.get('parent_header', {}).get('msg_id') != msg_id:
            continue
        kind = message['msg_type']
        content = message['content']
        if kind == 'execute_input':
            count = content['execution_count']
        elif kind in ('stream', 'display_data', 'execute_result', 'error', 'clear_output', 'update_display_data'):
            emit(request['id'], 'output', output=dict(output_type=kind, **content))
        elif kind == 'status' and content['execution_state'] == 'idle':
            with input_lock:
                active_input = None
            break
    while True:
        reply = client.get_shell_msg(timeout=30)
        if reply.get('parent_header', {}).get('msg_id') == msg_id:
            emit(request['id'], 'result', execution_count=reply['content'].get('execution_count', count), status=reply['content']['status'])
            break


def main():
    global manager, client
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    threading.Thread(target=read_requests, daemon=True).start()
    try:
        while True:
            request = requests.get()
            if request is None:
                break
            try:
                op = request.get('op')
                if op == 'start':
                    if manager is not None:
                        raise ValueError('Kernel already started')
                    python = request.get('python')
                    if not isinstance(python, str) or not python:
                        raise ValueError('Python interpreter is required')
                    manager = KernelManager()
                    manager.kernel_spec.argv = [python, '-m', 'ipykernel_launcher', '-f', '{connection_file}']
                    manager.start_kernel(stdout=sys.stderr, stderr=sys.stderr, **({'cwd': request['cwd']} if request.get('cwd') else {}))
                    client = manager.client()
                    client.start_channels()
                    client.wait_for_ready(timeout=30)
                    emit(request['id'], 'ready')
                elif op == 'shutdown':
                    if manager is not None and manager.has_kernel:
                        manager.shutdown_kernel(now=True)
                    emit(request['id'], 'stopped')
                    break
                elif client is None:
                    raise ValueError('Start a kernel first')
                elif op == 'execute':
                    execute(request)
                elif op == 'restart':
                    manager.restart_kernel(now=True)
                    client.wait_for_ready(timeout=30)
                    emit(request['id'], 'ready')
                else:
                    raise ValueError(f'Unsupported operation: {op}')
            except Exception as error:
                emit(request['id'], 'error', message=str(error))
    finally:
        if client is not None:
            client.stop_channels()
        if manager is not None and manager.has_kernel:
            manager.shutdown_kernel(now=True)


if __name__ == '__main__':
    main()
