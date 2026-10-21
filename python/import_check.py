"""Inspect imports without executing cells or importing their packages."""
import ast
import importlib.machinery
import json
import sys


class ImportVisitor(ast.NodeVisitor):
    def __init__(self):
        self.modules = []
        self.optional = []
        self.is_optional = False
        self.import_error_names = {'ImportError', 'ModuleNotFoundError'}
        self.typing_names = {'typing'}
        self.typechecking_names = {'TYPE_CHECKING'}

    def add(self, name):
        root = name.split('.')[0]
        target = self.optional if self.is_optional else self.modules
        if root not in target:
            target.append(root)

    def visit_Import(self, node):
        for alias in node.names:
            self.add(alias.name)
            if alias.name == 'typing':
                self.typing_names.add(alias.asname or alias.name)

    def visit_ImportFrom(self, node):
        if node.level == 0 and node.module:
            self.add(node.module)
            if node.module == 'builtins':
                for alias in node.names:
                    if alias.name in ('ImportError', 'ModuleNotFoundError'):
                        self.import_error_names.add(alias.asname or alias.name)
            if node.module == 'typing':
                for alias in node.names:
                    if alias.name == 'TYPE_CHECKING':
                        self.typechecking_names.add(alias.asname or alias.name)

    def visit_If(self, node):
        test = node.test
        is_types = (isinstance(test, ast.Name) and test.id in self.typechecking_names) or (
            isinstance(test, ast.Attribute) and test.attr == 'TYPE_CHECKING'
            and isinstance(test.value, ast.Name) and test.value.id in self.typing_names)
        for child in node.orelse if is_types else node.body + node.orelse:
            self.visit(child)

    def visit_Try(self, node):
        def catches_import(handler):
            types = handler.type.elts if isinstance(handler.type, ast.Tuple) else [handler.type]
            return any(isinstance(item, ast.Name) and item.id in self.import_error_names for item in types)
        previous = self.is_optional
        self.is_optional = previous or any(catches_import(handler) for handler in node.handlers)
        for child in node.body:
            self.visit(child)
        self.is_optional = previous
        for child in node.handlers + node.orelse + node.finalbody:
            self.visit(child)


def module_exists(name, cwd):
    if importlib.machinery.BuiltinImporter.find_spec(name) is not None:
        return True
    if importlib.machinery.FrozenImporter.find_spec(name) is not None:
        return True
    # PathFinder never imports a parent package for a root-module lookup.
    if importlib.machinery.PathFinder.find_spec(name, sys.path) is not None:
        return True
    return importlib.machinery.PathFinder.find_spec(name, [cwd]) is not None


def check_cells(cells, cwd, cached_availability=None, probe=None):
    availability = dict(cached_availability or {})
    parsed_by_source = {}
    parsed = []
    for source in cells:
        if source not in parsed_by_source:
            visitor = ImportVisitor()
            try:
                visitor.visit(ast.parse(source))
                record = {'modules': visitor.modules, 'optional': visitor.optional}
            except SyntaxError:
                record = {'modules': [], 'optional': [], 'syntaxError': True}
            parsed_by_source[source] = record
        parsed.append(parsed_by_source[source])
    names = list(probe or []) + [name for record in parsed for name in record['modules'] + record['optional']]
    for name in names:
        if name not in availability:
            availability[name] = module_exists(name, cwd)
    results = []
    for record in parsed:
        results.append({'modules': record['modules'],
                        'missing': [name for name in record['modules'] if not availability[name]],
                        'optional': [name for name in record['optional'] if name not in record['modules'] and not availability[name]],
                        **({'syntaxError': True} if record.get('syntaxError') else {})})
    return {'cells': results, 'parsed': parsed, 'availability': availability}


def main():
    raw = sys.stdin.buffer.read(10 * 1024 * 1024 + 1)
    if len(raw) > 10 * 1024 * 1024:
        raise ValueError('Import-check input too large')
    payload = json.loads(raw)
    cells, cwd = payload['cells'], payload['cwd']
    if not isinstance(cells, list) or not all(isinstance(cell, str) for cell in cells) or not isinstance(cwd, str):
        raise ValueError('Invalid import-check input')
    availability, probe = payload.get('availability', {}), payload.get('probe', [])
    def module_name(name):
        return isinstance(name, str) and name.isascii() and name.isidentifier()
    if not isinstance(availability, dict) or not all(module_name(name) and type(value) is bool for name, value in availability.items()):
        raise ValueError('Invalid cached availability')
    if not isinstance(probe, list) or not all(module_name(name) for name in probe):
        raise ValueError('Invalid module probes')
    print(json.dumps(check_cells(cells, cwd, availability, probe)))


if __name__ == '__main__':
    main()
