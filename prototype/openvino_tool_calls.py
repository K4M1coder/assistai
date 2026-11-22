"""Parse completed LFM3 tool blocks for an experimental OpenVINO adapter.

This module does not execute tools. It rejects malformed output rather than
recovering a potentially different task from an incomplete model response.
"""
import re

MAX_TEXT = 32768
MAX_CALLS = 4
MAX_TASK = 4000
BLOCK = re.compile(r'<tool_call>\s*<function=delegate_task>\s*<parameter=task>\n?(.*?)\n?</parameter>\s*</function>\s*</tool_call>', re.DOTALL)
MARKER = re.compile(r'</?(?:tool_call|function|parameter)(?:[=>\s]|$)')


def parse_tool_calls(text):
    if not isinstance(text, str) or len(text) > MAX_TEXT:
        raise ValueError('Invalid or oversized model response')
    calls, visible, cursor = [], [], 0
    for match in BLOCK.finditer(text):
        before = text[cursor:match.start()]
        if MARKER.search(before): raise ValueError('Malformed or unsupported tool block')
        task = match.group(1).strip()
        if not task or len(task) > MAX_TASK or MARKER.search(task): raise ValueError('Invalid task argument')
        calls.append({'name':'delegate_task', 'arguments':{'task':task}})
        if len(calls) > MAX_CALLS: raise ValueError('Too many tool calls')
        visible.append(before); cursor = match.end()
    remainder = text[cursor:]
    if MARKER.search(remainder): raise ValueError('Malformed or unsupported tool block')
    visible.append(remainder)
    return {'text':''.join(visible).strip(), 'tool_calls':calls}
