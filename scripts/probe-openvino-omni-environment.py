"""Inspect the isolated OpenVINO research environment without loading a model."""
import json
import platform

import openvino as ov
import openvino_genai as genai
import numpy

core = ov.Core()
devices = []
for name in core.available_devices:
    try:
        display = core.get_property(name, 'FULL_DEVICE_NAME')
    except RuntimeError:
        display = None
    devices.append({'id':name, 'name':display})
print(json.dumps({'python':platform.python_version(), 'openvino':ov.__version__, 'genai':genai.__version__,
                  'numpy':numpy.__version__, 'devices':devices, 'omni_pipeline_available':hasattr(genai, 'OmniPipeline'),
                  'model_loaded':False, 'inference_performed':False}))
