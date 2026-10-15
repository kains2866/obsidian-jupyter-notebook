import importlib.util
import unittest
import queue
import threading
from pathlib import Path
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('kernel_bridge_windows', Path(__file__).parents[1] / 'python/kernel_bridge.py')
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)

class WindowsCleanupTest(unittest.TestCase):
    def setUp(self):
        self.request_queue = queue.Queue()
        patcher = patch.object(bridge, 'requests', self.request_queue)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_eof_uses_kernel_manager_cleanup_instead_of_terminate_process(self):
        manager = Mock(has_kernel=True)
        with patch.object(bridge, 'manager', manager), patch.object(bridge.os, 'name', 'nt'), patch.object(bridge.os, 'read', return_value=b''), patch.object(bridge.os, 'kill') as kill:
            bridge.read_requests()
        manager.shutdown_kernel.assert_called_once_with(now=True)
        kill.assert_not_called()
        self.assertIsNone(bridge.requests.get_nowait())

    def test_shutdown_failure_still_enqueues_exit_sentinel(self):
        manager = Mock(has_kernel=True)
        manager.shutdown_kernel.side_effect = RuntimeError('shutdown failed')
        with patch.object(bridge, 'manager', manager), patch.object(bridge.os, 'name', 'nt'), patch.object(bridge.os, 'read', return_value=b''), patch.object(bridge.os, 'kill') as kill:
            with self.assertRaisesRegex(RuntimeError, 'shutdown failed'):
                bridge.read_requests()
        manager.shutdown_kernel.assert_called_once_with(now=True)
        kill.assert_not_called()
        self.assertIsNone(self.request_queue.get_nowait())
        self.assertTrue(self.request_queue.empty())

    def test_windows_eof_releases_active_execution_and_exits_main_loop(self):
        # Simulate the Windows branch on this host. Events control the ordering:
        # execute blocks -> reader sees EOF -> Jupyter shutdown -> execution wakes.
        executing = threading.Event()
        shutdown = threading.Event()
        state = {'alive': True}
        manager = Mock(has_kernel=True)
        manager.is_alive.side_effect = lambda: state['alive']
        client = Mock()
        client.execute.return_value = 'executing-message'
        events = []
        failures = []

        def receive_iopub(timeout):
            executing.set()
            if not shutdown.wait(2):
                raise TimeoutError('EOF failed to shut down the executing kernel')
            raise queue.Empty()

        def read_eof(*_args):
            if not executing.wait(2):
                raise TimeoutError('Execution never entered its blocking receive')
            return b''

        def stop_kernel(*, now):
            self.assertTrue(executing.is_set())
            self.assertTrue(now)
            state['alive'] = False
            manager.has_kernel = False
            shutdown.set()

        def run_main():
            try:
                bridge.main()
            except BaseException as error:
                failures.append(error)

        client.get_iopub_msg.side_effect = receive_iopub
        manager.shutdown_kernel.side_effect = stop_kernel
        self.request_queue.put({'id': 'execute', 'op': 'execute', 'code': 'blocking()'})
        with patch.object(bridge, 'manager', manager), patch.object(bridge, 'client', client), patch.object(bridge.os, 'name', 'nt'), patch.object(bridge.os, 'read', side_effect=read_eof), patch.object(bridge.os, 'kill') as kill, patch.object(bridge.signal, 'signal'), patch.object(bridge, 'emit', side_effect=lambda *args, **kwargs: events.append((args, kwargs))):
            main_thread = threading.Thread(target=run_main, daemon=True)
            main_thread.start()
            main_thread.join(3)
            self.assertFalse(main_thread.is_alive(), 'Main loop failed to consume EOF sentinel')
            self.assertEqual(failures, [])
            self.assertTrue(shutdown.is_set())
            manager.shutdown_kernel.assert_called_once_with(now=True)
            client.stop_channels.assert_called_once_with()
            client.get_shell_msg.assert_not_called()
            kill.assert_not_called()
        self.assertEqual(events, [(('execute', 'error'), {'message': 'Kernel exited while executing'})])
        self.assertTrue(self.request_queue.empty())

if __name__ == '__main__':
    unittest.main()
