# Lanzador de Nullraptor en Windows (sin Docker). Pide la clave del cofre solo la primera vez y la recuerda
# cifrada con DPAPI: solo tu usuario de Windows en este equipo puede leerla, y nunca sale de él.
# Si la clave recordada deja de abrir el cofre (p. ej. lo has rehecho), la olvida y la vuelve a pedir.
$agente = Split-Path $PSScriptRoot -Parent
$cofre = if ($env:CREDENCIALES) { $env:CREDENCIALES } else { Join-Path $HOME '.nullraptor\credenciales.cifrado' }
$guardada = Join-Path $env:LOCALAPPDATA 'Nullraptor\clave.dpapi'
if (-not $env:TRABAJO_DIR) { $env:TRABAJO_DIR = Join-Path $HOME 'nullraptor-trabajo' }

function Salir($mensaje, $codigo = 1) { Write-Host $mensaje; Read-Host 'Pulsa Intro para cerrar' | Out-Null; exit $codigo }
if (-not (Test-Path $cofre)) { Salir "No encuentro el cofre en $cofre (cópialo desde el USB: Nullraptor\credenciales.cifrado)." }

# Deja la clave en AGENTE_CLAVE si abre el cofre; preparar.mjs la usa y no la pasa a los procesos hijos.
function Probar([securestring]$s) {
  $env:AGENTE_CLAVE = [Net.NetworkCredential]::new('', $s).Password
  & node (Join-Path $agente 'scripts\credenciales.mjs') listar $cofre *> $null
  if ($LASTEXITCODE -eq 0) { return $true }
  Remove-Item Env:AGENTE_CLAVE -ErrorAction SilentlyContinue
  return $false
}

$ok = $false
if (Test-Path $guardada) {
  try { $ok = Probar ((Get-Content $guardada -Raw).Trim() | ConvertTo-SecureString) } catch { $ok = $false }
  if (-not $ok) { Remove-Item $guardada; Write-Host 'La clave recordada ya no abre el cofre: escríbela de nuevo.' }
}
for ($i = 0; -not $ok -and $i -lt 3; $i++) {
  $s = Read-Host 'Clave del cofre (solo se pide esta vez en este equipo)' -AsSecureString
  if (Probar $s) {
    $ok = $true
    New-Item -ItemType Directory -Force (Split-Path $guardada) | Out-Null
    $s | ConvertFrom-SecureString | Set-Content $guardada
  } else { Write-Host 'Clave incorrecta.' }
}
if (-not $ok) { Salir 'No se pudo abrir el cofre.' }

Set-Location $agente
& node scripts\preparar.mjs
$codigo = $LASTEXITCODE
Remove-Item Env:AGENTE_CLAVE -ErrorAction SilentlyContinue
if ($codigo) { Salir "Nullraptor terminó con error ($codigo)." $codigo }
