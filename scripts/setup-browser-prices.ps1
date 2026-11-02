$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $taskRoot
if (-not (Test-Path 'integrations/JD-Taobao-MCP/jd_taobao_mcp/service.py')) { throw 'Missing vendored JD-Taobao-MCP source.' }
python -m venv integrations/.venv
if ($LASTEXITCODE -ne 0) { throw 'Python 3.10+ is required.' }
& integrations/.venv/Scripts/python.exe -m pip install -r integrations/browser-requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Dependency install failed. Check network and retry.' }
& integrations/.venv/Scripts/python.exe -c "import sys; sys.path.insert(0, 'integrations/JD-Taobao-MCP'); from jd_taobao_mcp.service import ShoppingBrowserService; print('Browser price dependencies ready. Use installed Chrome or Edge.')"
if ($LASTEXITCODE -ne 0) { throw 'Dependency validation failed.' }
