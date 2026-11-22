import unittest
from prototype.openvino_tool_calls import parse_tool_calls


class ToolCallTests(unittest.TestCase):
    def test_text_and_complete_delegation(self):
        text = 'Working. <tool_call>\n<function=delegate_task>\n<parameter=task>\nRead fixture.txt\n</parameter>\n</function>\n</tool_call>'
        self.assertEqual(parse_tool_calls(text), {'text':'Working.', 'tool_calls':[{'name':'delegate_task','arguments':{'task':'Read fixture.txt'}}]})
        self.assertEqual(parse_tool_calls('Bonjour')['tool_calls'], [])

    def test_multiple_calls_are_ordered(self):
        block = '<tool_call><function=delegate_task><parameter=task>Read</parameter></function></tool_call>'
        self.assertEqual(len(parse_tool_calls(block * 4)['tool_calls']), 4)
        with self.assertRaises(ValueError): parse_tool_calls(block * 5)

    def test_rejects_incomplete_unknown_duplicate_and_nested_markup(self):
        invalid = ['<tool_call>', '<tool_call><function=other><parameter=task>x</parameter></function></tool_call>',
                   '<tool_call><function=delegate_task><parameter=task>x</parameter><parameter=task>y</parameter></function></tool_call>',
                   '<tool_call><function=delegate_task><parameter=task>x<tool_call>y</parameter></function></tool_call>',
                   '<tool_call><function=delegate_task><parameter=task> </parameter></function></tool_call>']
        for item in invalid:
            with self.subTest(item=item), self.assertRaises(ValueError): parse_tool_calls(item)

    def test_rejects_oversized_input_and_task(self):
        with self.assertRaises(ValueError): parse_tool_calls('x' * 32769)
        with self.assertRaises(ValueError): parse_tool_calls('<tool_call><function=delegate_task><parameter=task>'+'x'*4001+'</parameter></function></tool_call>')


if __name__ == '__main__': unittest.main()
