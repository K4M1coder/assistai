"""Inspect local tool-template rendering without loading inference weights."""
import json
from pathlib import Path
import openvino_genai as genai

root = Path(__file__).resolve().parents[1]
tokenizer = genai.Tokenizer(str(root / '.cache/lfm3-omni-openvino-int4'))
tool = {'type':'function','function':{'name':'delegate_task','description':'Delegate a local task',
        'parameters':{'type':'object','properties':{'task':{'type':'string'}},'required':['task']}}}
history = genai.ChatHistory([
    {'role':'user','content':'Read the file.'},
    {'role':'assistant','content':'','tool_calls':[{'id':'test-call','type':'function',
        'function':{'name':'delegate_task','arguments':{'task':'Read fixture.txt'}}}]},
    {'role':'tool','tool_call_id':'test-call','content':'BLUEBIRD'},
])
history.set_tools([tool])
rendered = tokenizer.apply_chat_template(history, True)
checks = {'tool_definition':'"name": "delegate_task"' in rendered,
          'tool_call':'<function=delegate_task>' in rendered,
          'arguments':'Read fixture.txt' in rendered,
          'tool_response':'<tool_response>' in rendered and 'BLUEBIRD' in rendered}
messages = history.get_messages()
messages[1]['tool_calls'][0]['function']['arguments'] = json.dumps({'task':'Read fixture.txt'})
history.set_messages(messages)
try:
    adapted = tokenizer.apply_chat_template(history, True)
    json_string_arguments = 'accepted' if '<function=delegate_task>' in adapted and 'Read fixture.txt' in adapted else 'content lost'
except Exception as error:
    json_string_arguments = 'rejected'
    if 'mapping' not in str(error).lower(): raise
try:
    tokenizer.apply_chat_template(history, True, apply_polyfills=False)
    raw_json_string_arguments = 'accepted'
except Exception as error:
    raw_json_string_arguments = 'rejected'
    if 'mapping' not in str(error).lower(): raise
print(json.dumps({'checks':checks,'json_string_arguments':json_string_arguments,'raw_json_string_arguments':raw_json_string_arguments,'characters':len(rendered),'model_loaded':False,'inference_performed':False,'tool_executed':False}))
if not all(checks.values()) or json_string_arguments != 'accepted': raise RuntimeError('Tool history was not preserved in template')
