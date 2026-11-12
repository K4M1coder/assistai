"""Statically evaluate a narrowly scoped arithmetic fixture without executing its code."""
import ast
from pathlib import Path
import sys


def evaluate(node, values):
    if isinstance(node, ast.Name) and node.id in values:
        return values[node.id]
    if isinstance(node, ast.Constant) and type(node.value) is int:
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in (ast.Add, ast.Sub, ast.Mult):
        left, right = evaluate(node.left, values), evaluate(node.right, values)
        return {ast.Add: lambda: left + right, ast.Sub: lambda: left - right,
                ast.Mult: lambda: left * right}[type(node.op)]()
    if isinstance(node, ast.UnaryOp) and type(node.op) is ast.USub:
        return -evaluate(node.operand, values)
    raise ValueError('Unsupported expression in fixture')


def verify(path):
    tree = ast.parse(Path(path).read_text(encoding='utf-8'))
    if len(tree.body) != 1 or not isinstance(tree.body[0], ast.FunctionDef):
        raise ValueError('Expected a single function')
    fn = tree.body[0]
    if (fn.name != 'add' or fn.decorator_list or fn.returns or fn.args.posonlyargs or fn.args.kwonlyargs
            or fn.args.vararg or fn.args.kwarg or fn.args.defaults or [arg.arg for arg in fn.args.args] != ['a', 'b']
            or len(fn.body) != 1 or not isinstance(fn.body[0], ast.Return)):
        raise ValueError('Unexpected function structure')
    for a, b in ((2, 3), (-4, 2), (0, 0), (11, -7)):
        if evaluate(fn.body[0].value, {'a': a, 'b': b}) != a + b:
            raise ValueError('Arithmetic check failed')


if __name__ == '__main__':
    verify(sys.argv[1])
