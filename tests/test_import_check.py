import importlib.util
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

spec = importlib.util.spec_from_file_location('import_check', Path(__file__).parents[1] / 'python/import_check.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


class ImportCheckTest(unittest.TestCase):
    def check(self, source, cwd='.'):
        return helper.check_cells([source], cwd)['cells'][0]

    def test_stdlib_catalog_does_not_imply_platform_availability(self):
        with patch.object(helper.sys, 'stdlib_module_names', {'missing_platform_stdlib'}, create=True):
            self.assertFalse(helper.module_exists('missing_platform_stdlib', '.'))
        self.assertTrue(helper.module_exists('sys', '.'))
        self.assertTrue(helper.module_exists('os', '.'))

    def test_alias_comma_multiline_and_ignore_literals(self):
        result = self.check('import os as o, definitely_absent_064 as n\nfrom json import (loads, dumps)\n# import fake\ns = "import fake"')
        self.assertEqual(result['modules'], ['os', 'definitely_absent_064', 'json'])
        self.assertEqual(result['missing'], ['definitely_absent_064'])

    def test_relative_invalid_and_typechecking(self):
        self.assertEqual(self.check('from .local import thing')['modules'], [])
        self.assertTrue(self.check('import (')['syntaxError'])
        result = self.check('from typing import TYPE_CHECKING\nif TYPE_CHECKING:\n import fake_type\nif typing.TYPE_CHECKING:\n import fake_other')
        self.assertEqual(result['missing'], [])

    def test_typechecking_aliases(self):
        result = self.check('import typing as t\nfrom typing import TYPE_CHECKING as TC\nif t.TYPE_CHECKING:\n import fake_type\nif TC:\n import fake_other')
        self.assertEqual(result['missing'], [])

    def test_optional_imports(self):
        result = self.check('try:\n import fake_optional\nexcept ImportError:\n pass\nimport fake_required')
        self.assertEqual(result['missing'], ['fake_required'])
        self.assertEqual(result['optional'], ['fake_optional'])

    def test_optional_exception_alias(self):
        result = self.check('from builtins import ImportError as IE\ntry:\n import fake_optional\nexcept IE:\n pass')
        self.assertEqual(result['missing'], [])
        self.assertEqual(result['optional'], ['fake_optional'])

    def test_installed_optional_import_not_reported(self):
        result = self.check('try:\n import os\n import fake_optional\nexcept ImportError:\n pass')
        self.assertEqual(result['optional'], ['fake_optional'])
        self.assertEqual(result['missing'], [])

    def test_local_module_never_executed_and_stdlib_not_shadowed(self):
        with tempfile.TemporaryDirectory() as directory:
            sentinel = Path(directory, 'sentinel')
            Path(directory, 'localmod.py').write_text('from pathlib import Path\nPath(' + repr(str(sentinel)) + ').write_text("executed")')
            Path(directory, 'pkg').mkdir()
            Path(directory, 'os.py').write_text('raise RuntimeError("do not execute")')
            self.assertEqual(self.check('import localmod, pkg, os', directory)['missing'], [])
            self.assertFalse(sentinel.exists())

    def test_nested_package_init_never_executed(self):
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, 'pkg').mkdir()
            Path(directory, 'pkg/__init__.py').write_text('raise RuntimeError("do not execute")')
            self.assertEqual(self.check('from pkg.submodule import x', directory)['missing'], [])

class IncrementalProtocolTest(unittest.TestCase):
    def test_cached_availability_skips_probes_and_duplicate_sources_parse_once(self):
        with patch.object(helper.ast, 'parse', wraps=helper.ast.parse) as parse, patch.object(helper, 'module_exists', return_value=False) as probe:
            result = helper.check_cells(['import absent_new', 'import absent_new'], '.', {'known': True}, ['known'])
            self.assertEqual(parse.call_count, 1)
            self.assertEqual(probe.call_count, 1)
            self.assertEqual(result['availability'], {'known': True, 'absent_new': False})
            self.assertEqual(result['parsed'][0]['modules'], ['absent_new'])


if __name__ == '__main__':
    unittest.main()
