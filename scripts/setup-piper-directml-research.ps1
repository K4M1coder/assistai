param([string]$Python='python')
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$envPath=Join-Path $root '.cache/piper-directml-clean'
if(Test-Path -LiteralPath $envPath){throw 'Research environment already exists; preserve or remove it explicitly before setup'}
& $Python -m venv $envPath
if($LASTEXITCODE -ne 0){throw 'Could not create Python environment'}
$python=Join-Path $envPath 'Scripts/python.exe'
# Piper normally installs the CPU ONNX Runtime distribution, which conflicts
# with DirectML because the two distributions share the same import package.
& $python -m pip install --no-deps piper-tts==1.8.0 onnxruntime-directml==1.23.0 numpy==1.26.4 packaging==26.3 flatbuffers==25.12.19 protobuf==7.36.2 coloredlogs==15.0.1 humanfriendly==10.0 pyreadline3==3.5.6 sympy==1.14.0 mpmath==1.3.0 pathvalidate==3.3.1
if($LASTEXITCODE -ne 0){throw 'Research dependencies failed to install'}
$check=@(& $python -m pip check)
if($LASTEXITCODE -ne 0 -and ($check.Count -ne 1 -or $check[0] -notmatch '^piper-tts 1\.8\.0 requires onnxruntime, which is not installed\.$')){throw "Unexpected dependency issue: $($check -join '; ')"}
& $python -c "import onnxruntime as o; import piper; assert o.__version__ == '1.23.0' and 'DmlExecutionProvider' in o.get_available_providers(); print(o.__version__, o.get_available_providers())"
if($LASTEXITCODE -ne 0){throw 'DirectML provider verification failed'}
