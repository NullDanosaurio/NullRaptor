param([ValidateSet('claude','codex','estado','ruflo','prueba','diagnostico')][string]$Modo='claude')
$ErrorActionPreference='Stop'
Set-Location -LiteralPath $PSScriptRoot
$nodeRuntime='C:\Users\danoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin'
$gitRuntime='C:\Users\danoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd'
$codexCommand=(Get-Command codex).Source
$env:PATH="$PSScriptRoot\node_modules\.bin;$PSScriptRoot\.tools\launchers;$(Split-Path $codexCommand);$nodeRuntime;$gitRuntime;$env:PATH"
# Evita que una clave API heredada cambie la facturación de estas sesiones.
Remove-Item Env:ANTHROPIC_API_KEY -ErrorAction SilentlyContinue
Remove-Item Env:OPENAI_API_KEY -ErrorAction SilentlyContinue
switch ($Modo) {
  'diagnostico' { & "$nodeRuntime\node.exe" scripts/abrir.mjs diagnostico }
  'prueba' { $env:RUFLO_CODEX_EXE=(Get-Command codex).Source; & "$nodeRuntime\node.exe" scripts/prueba-equipo.mjs }
  'claude' { & "$PSScriptRoot\node_modules\.bin\claude.cmd" }
  'codex' {
    $mcpCommand = 'mcp_servers.ruflo.command=' + (ConvertTo-Json "$nodeRuntime\node.exe" -Compress)
    $mcpArgs = 'mcp_servers.ruflo.args=' + (ConvertTo-Json @("$PSScriptRoot\node_modules\ruflo\bin\ruflo.js",'mcp','start') -Compress)
    & codex -c $mcpCommand -c $mcpArgs -c 'mcp_servers.ruflo.startup_timeout_sec=120'
  }
  'ruflo' { & "$PSScriptRoot\node_modules\.bin\ruflo.cmd" --help }
  'estado' {
    & "$PSScriptRoot\node_modules\.bin\claude.cmd" --version
    & "$PSScriptRoot\node_modules\.bin\claude.cmd" auth status
    & codex login status
    & "$PSScriptRoot\node_modules\.bin\ruflo.cmd" --version
  }
}
