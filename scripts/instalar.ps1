# Instala o actualiza Nullraptor en este equipo desde el USB (doble clic en "Instalar Nullraptor.cmd").
# Nullraptor solo corre en Docker: aquí no se instala ni git ni Node. Pasos: Docker Desktop si falta (winget) y en
# marcha, cofre del USB a ~/.nullraptor, sesión en el registro si la imagen lo pide, imagen, lanzador y acceso
# directo en el escritorio, y arranque. Se puede repetir: lo que ya está, se deja o se actualiza.
# Este archivo vive en el repo (scripts/instalar.ps1) y en la imagen; el USB guarda una copia que se refresca al terminar.
$ErrorActionPreference = 'Stop'
$imagen = if ($env:NULLRAPTOR_IMAGEN) { $env:NULLRAPTOR_IMAGEN } else { 'ghcr.io/nulldanosaurio/nullraptor:main' }
$registro = $imagen.Split('/')[0]
$usb = Split-Path $PSCommandPath -Parent
$casa = Join-Path $env:LOCALAPPDATA 'Nullraptor'
$lanzador = Join-Path $casa 'arrancar.ps1'

function Salir($mensaje, $codigo = 1) { Write-Host $mensaje; Read-Host 'Pulsa Intro para cerrar' | Out-Null; exit $codigo }
function Refrescar-Path { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }
function Docker-Listo { $ErrorActionPreference = 'Continue'; docker info *> $null; return $LASTEXITCODE -eq 0 }

# 1. Docker Desktop (necesita WSL 2; winget pide permisos de administrador).
Refrescar-Path
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { Salir 'Falta Docker y no hay winget: instala Docker Desktop a mano (docker.com) y repite.' }
  Write-Host 'Instalando Docker Desktop (acepta el aviso de administrador)...'
  winget install --id Docker.DockerDesktop -e --silent --accept-source-agreements --accept-package-agreements --override 'install --quiet --accept-license'
  Refrescar-Path
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Salir 'No se pudo instalar Docker Desktop. Reinicia el equipo y repite el instalador.' }
  Write-Host 'Docker instalado. Si Windows pide reiniciar (para WSL 2), reinicia y vuelve a ejecutar el instalador.'
}
if (-not (Docker-Listo)) {
  $exe = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
  if (-not (Test-Path $exe)) { Salir "No encuentro Docker Desktop en $exe." }
  Write-Host 'Arrancando Docker Desktop (la primera vez puede pedirte aceptar condiciones o iniciar sesión)...'
  Start-Process $exe
  for ($i = 0; -not (Docker-Listo); $i++) {
    if ($i -ge 150) { Salir 'Docker no ha arrancado en 5 minutos. Si acaba de instalarse, reinicia el equipo y repite el instalador.' }
    Start-Sleep -Seconds 2
  }
}
Write-Host 'Docker en marcha.'

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

# 3. Imagen. Si el registro pide sesión (imagen privada), se inicia una vez y Docker la recuerda.
#    En GHCR: usuario de GitHub y un token clásico con permiso read:packages (los fine-grained no sirven).
$ErrorActionPreference = 'Continue'
Write-Host "Descargando $imagen (la primera vez tarda unos minutos)..."
docker pull $imagen
for ($i = 0; $LASTEXITCODE -and $i -lt 3; $i++) {
  Write-Host "`nNo se pudo descargar la imagen: $registro pide iniciar sesión (o no hay internet)."
  $usuario = Read-Host "Usuario de $registro (Intro para cancelar)"
  if (-not $usuario) { break }
  $token = Read-Host 'Token (read:packages)' -AsSecureString
  [Net.NetworkCredential]::new('', $token).Password | docker login $registro -u $usuario --password-stdin
  if (-not $LASTEXITCODE) { docker pull $imagen }
}
if ($LASTEXITCODE) { Salir "No se pudo descargar $imagen." }
$ErrorActionPreference = 'Stop'

# 4. Lanzador desde la imagen, acceso directo en el escritorio y copia al día de este instalador en el USB.
New-Item -ItemType Directory -Force $casa | Out-Null
$tmp = docker create $imagen
docker cp "${tmp}:/nullraptor/scripts/arrancar.ps1" $lanzador
try { docker cp "${tmp}:/nullraptor/scripts/instalar.ps1" $PSCommandPath } catch { }
docker rm $tmp | Out-Null
$lnk = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Nullraptor.lnk'))
$lnk.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$lanzador`""
$lnk.WorkingDirectory = $casa; $lnk.Save()

Write-Host "`nNullraptor listo (imagen $imagen). Acceso directo `"Nullraptor`" en el escritorio."
Write-Host 'La primera vez, dentro de Claude, escribe /login para tener los conectores de claude.ai (21st, Notion...).'
if ((Read-Host '¿Lo arranco ahora? (S/n)') -notmatch '^n') { & $lanzador }
