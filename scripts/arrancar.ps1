# Lanzador de Nullraptor en Windows: siempre dentro de Docker, nunca sobre el sistema.
# Arranca Docker Desktop si hace falta, actualiza la imagen, levanta el contenedor con el servidor y el panel web,
# y abre el panel en el navegador (http://localhost:4321).
# La clave del cofre se pide solo la primera vez y se recuerda cifrada con DPAPI (solo tu usuario de Windows en
# este equipo puede leerla). Si deja de abrir el cofre, se olvida y se vuelve a pedir.
# El instalador copia este archivo a %LOCALAPPDATA%\Nullraptor; tras cada actualización se refresca desde la imagen.
$imagen = if ($env:NULLRAPTOR_IMAGEN) { $env:NULLRAPTOR_IMAGEN } else { 'ghcr.io/nulldanosaurio/nullraptor:main' }
$cofre = if ($env:CREDENCIALES) { $env:CREDENCIALES } else { Join-Path $HOME '.nullraptor\credenciales.cifrado' }
$guardada = Join-Path $env:LOCALAPPDATA 'Nullraptor\clave.dpapi'

function Salir($mensaje, $codigo = 1) { Write-Host $mensaje; Read-Host 'Pulsa Intro para cerrar' | Out-Null; exit $codigo }
function Refrescar-Path { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }
function Docker-Listo { docker info *> $null; return $LASTEXITCODE -eq 0 }
$nombre = 'nullraptor'
$puerto = if ($env:PANEL_PUERTO) { $env:PANEL_PUERTO } else { '4321' }
$url = "http://localhost:$puerto"
# 127.0.0.1 y no localhost: .NET prueba antes ::1, que no está publicado, y agota la espera.
function Panel-Listo { try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 "http://127.0.0.1:$puerto" | Out-Null; return $true } catch { return $false } }
function Abrir-Panel {
  Start-Process $url
  Write-Host "`nNullraptor en marcha: $url (sigue funcionando aunque cierres esta ventana)."
  Write-Host "Para pararlo: docker stop $nombre (o desde Docker Desktop)."
  Start-Sleep -Seconds 5; exit 0
}

# 1. Docker en marcha.
Refrescar-Path
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Salir 'Docker no está instalado: ejecuta "Instalar Nullraptor.cmd" del USB.' }
if (-not (Docker-Listo)) {
  $exe = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
  if (-not (Test-Path $exe)) { Salir "Docker no responde y no encuentro Docker Desktop en $exe." }
  Write-Host 'Arrancando Docker Desktop...'
  Start-Process $exe
  for ($i = 0; -not (Docker-Listo); $i++) {
    if ($i -ge 90) { Salir 'Docker no ha arrancado en 3 minutos. Ábrelo a mano (acepta sus condiciones si las pide) y vuelve a intentarlo.' }
    Start-Sleep -Seconds 2
  }
}

# Si ya está en marcha, solo se abre el navegador.
if ((docker inspect -f '{{.State.Running}}' $nombre 2>$null) -eq 'true' -and (Panel-Listo)) { Abrir-Panel }

# 2. Imagen al día. Sin internet o sin acceso al registro, se usa la que ya haya en el equipo.
Write-Host "Comprobando $imagen..."
docker pull -q $imagen *> $null
if ($LASTEXITCODE) {
  docker image inspect $imagen *> $null
  if ($LASTEXITCODE) { Salir "No se pudo descargar $imagen. Ejecuta de nuevo el instalador (inicia sesión en el registro)." }
  Write-Host 'Aviso: no se pudo actualizar la imagen; uso la que hay en el equipo.'
}

# 3. Cofre y clave. El cofre se monta en solo lectura; la clave entra por AGENTE_CLAVE (preparar.mjs no la pasa
#    a los procesos hijos). Se prueba con un contenedor de un solo uso antes de abrir el menú.
if (-not (Test-Path $cofre)) { Salir "No encuentro el cofre en $cofre (cópialo desde el USB: Nullraptor\credenciales.cifrado)." }
$montaCofre = "${cofre}:/cofre/credenciales.cifrado:ro"
function Probar([securestring]$s) {
  $env:AGENTE_CLAVE = [Net.NetworkCredential]::new('', $s).Password
  docker run --rm -e AGENTE_CLAVE -v $montaCofre --entrypoint node $imagen scripts/credenciales.mjs listar /cofre/credenciales.cifrado *> $null
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

# 4. Este lanzador, al día con la imagen (vale para el próximo arranque). Solo la copia instalada, no la del repo.
$instalado = Join-Path $env:LOCALAPPDATA 'Nullraptor\arrancar.ps1'
if ($PSCommandPath -eq $instalado) {
  $tmp = docker create $imagen
  if (-not $LASTEXITCODE) { docker cp "${tmp}:/nullraptor/scripts/arrancar.ps1" $instalado *> $null; docker rm $tmp *> $null }
}

# 5. Servidor y panel web dentro del contenedor, en segundo plano. Todo lo del equipo queda en el volumen
#    nullraptor (/estado). El puerto solo se publica en este equipo (127.0.0.1).
docker rm -f $nombre *> $null
docker run -d --name $nombre -e AGENTE_CLAVE -v nullraptor:/estado -v $montaCofre -p "127.0.0.1:${puerto}:4321" $imagen node panel/servidor.mjs | Out-Null
$codigo = $LASTEXITCODE
Remove-Item Env:AGENTE_CLAVE -ErrorAction SilentlyContinue
if ($codigo) { Salir "No se pudo arrancar el contenedor ($codigo). ¿Está ocupado el puerto $puerto?" $codigo }
Write-Host 'Preparando la memoria y los proyectos (la primera vez tarda un poco)...'
for ($i = 0; -not (Panel-Listo); $i++) {
  if ((docker inspect -f '{{.State.Running}}' $nombre 2>$null) -ne 'true') { docker logs --tail 30 $nombre; Salir 'Nullraptor se ha parado al arrancar (arriba, su registro).' }
  if ($i -ge 180) { Salir "El panel no responde tras 6 minutos. Registro: docker logs $nombre" }
  Start-Sleep -Seconds 2
}
Abrir-Panel
