# Instala o actualiza Nullraptor en este equipo desde el USB (doble clic en "Instalar Nullraptor.cmd").
# Pasos: git y Node si faltan (winget), cofre del USB a ~/.nullraptor, agente desde GitHub, dependencias,
# acceso directo en el escritorio y arranque. Se puede repetir: lo que ya está, se deja o se actualiza.
# Este archivo vive en el repo (scripts/instalar.ps1); el USB guarda una copia que se refresca al terminar.
$ErrorActionPreference = 'Stop'
$repo = 'https://github.com/NullDanosaurio/NullRaptor.git'
$usb = Split-Path $PSCommandPath -Parent
$trabajo = if ($env:TRABAJO_DIR) { $env:TRABAJO_DIR } else { Join-Path $HOME 'nullraptor-trabajo' }
$agente = Join-Path $trabajo 'agente'

function Salir($mensaje, $codigo = 1) { Write-Host $mensaje; Read-Host 'Pulsa Intro para cerrar' | Out-Null; exit $codigo }
function Refrescar-Path { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }
function Asegurar($orden, $paquete) {
  if (Get-Command $orden -ErrorAction SilentlyContinue) { return }
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { Salir "Falta $orden y no hay winget: instálalo a mano ($paquete)." }
  Write-Host "Instalando $paquete..."
  winget install --id $paquete -e --silent --accept-source-agreements --accept-package-agreements
  Refrescar-Path
  if (-not (Get-Command $orden -ErrorAction SilentlyContinue)) { Salir "No se pudo instalar $paquete. Ciérralo, vuelve a abrirlo o instálalo a mano." }
}

# 1. Herramientas.
Asegurar git 'Git.Git'
Asegurar node 'OpenJS.NodeJS.LTS'
$mayor = [int]((node --version) -replace '^v(\d+).*', '$1')
if ($mayor -lt 24) { Salir "Node $(node --version) es antiguo: hace falta 24 o superior (winget upgrade OpenJS.NodeJS.LTS)." }

# 2. Cofre: el del USB es el principal. Si el del equipo es distinto, se pregunta antes de sustituirlo.
$cofreUsb = Join-Path $usb 'credenciales.cifrado'
$cofre = Join-Path $HOME '.nullraptor\credenciales.cifrado'
if (-not (Test-Path $cofreUsb)) { Salir "No encuentro $cofreUsb en el USB." }
New-Item -ItemType Directory -Force (Split-Path $cofre) | Out-Null
if (-not (Test-Path $cofre)) { Copy-Item $cofreUsb $cofre }
elseif ((Get-FileHash $cofre).Hash -ne (Get-FileHash $cofreUsb).Hash) {
  if ((Read-Host 'El cofre de este equipo es distinto del del USB. ¿Lo sustituyo por el del USB? (s/N)') -match '^s') {
    Copy-Item $cofre "$cofre.anterior" -Force; Copy-Item $cofreUsb $cofre -Force
  }
}

# 3. Agente: se clona la primera vez; después, solo avance rápido (no pisa cambios locales).
if (Test-Path (Join-Path $agente '.git')) {
  git -C $agente pull --ff-only; if ($LASTEXITCODE) { Write-Host "Aviso: $agente no avanza en rápido; se deja como está." }
} else {
  Write-Host "Descargando el agente en $agente..."
  git clone -c core.longpaths=true $repo $agente; if ($LASTEXITCODE) { Salir 'No se pudo descargar el agente (¿hay internet?).' }
}

# 4. Dependencias (ver "Desarrollo del agente" en LEEME.md: npm 12 bloquea los scripts y Claude necesita el suyo).
Push-Location $agente
npm ci --ignore-scripts; if ($LASTEXITCODE) { Pop-Location; Salir 'Falló npm ci.' }
node node_modules/@anthropic-ai/claude-code/install.cjs; if ($LASTEXITCODE) { Pop-Location; Salir 'Falló la instalación de Claude Code.' }
Pop-Location

# 5. Acceso directo en el escritorio y copia al día de este instalador en el USB (si se puede escribir).
$lnk = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Nullraptor.lnk'))
$lnk.TargetPath = Join-Path $agente 'Nullraptor.cmd'; $lnk.WorkingDirectory = $agente; $lnk.Save()
try { Copy-Item (Join-Path $agente 'scripts\instalar.ps1') $PSCommandPath -Force } catch { }

Write-Host "`nNullraptor listo en $agente. Acceso directo "Nullraptor" en el escritorio."
Write-Host 'La primera vez, dentro de Claude, escribe /login para tener los conectores de claude.ai (21st, Notion...).'
if ((Read-Host '¿Lo arranco ahora? (S/n)') -notmatch '^n') { & (Join-Path $agente 'Nullraptor.cmd') }
