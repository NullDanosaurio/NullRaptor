# Lanzador de Nullraptor en Windows: siempre dentro de Docker, nunca sobre el sistema.
# Arranca Docker Desktop si hace falta, actualiza la imagen, levanta el contenedor con el servidor y el panel web,
# y abre el panel en el navegador (http://localhost:4321).
# La clave del cofre se pide solo la primera vez y se recuerda cifrada con DPAPI (solo tu usuario de Windows en
# este equipo puede leerla). Si deja de abrir el cofre, se olvida y se vuelve a pedir.
# El instalador copia este archivo a %LOCALAPPDATA%\Nullraptor; tras cada actualización se refresca desde la imagen.
# Modo red (otros navegadores de casa, con código de acceso): una vez con -Red y se recuerda; -SoloEquipo lo quita.
# Tailscale (desde cualquier parte, solo tus dispositivos, con passkey): una vez con -Tailscale y se recuerda;
# -SinTailscale lo quita. Publica el panel con «tailscale serve» (HTTPS dentro de tu tailnet; nunca Funnel).
# Carpetas de Windows para la IA: -Carpeta 'C:\ruta' (una o varias, separadas por comas) se monta con lectura y
# escritura en /pc/<nombre> y se recuerda; -SinCarpetas las quita todas. Nunca una que contenga el cofre o la clave.
# Actualización automática: la copia instalada registra la tarea «Nullraptor (actualizar)», que cada 5 minutos lo
# ejecuta con -Actualizar (sin ventana ni preguntas). Si hay imagen nueva, recrea el contenedor con los mismos
# ajustes cuando no hay sesiones de Claude abiertas o cuando se pide desde el panel («Actualizar ahora»); si no,
# el panel avisa. Si el contenedor está parado no lo arranca. Registro en %LOCALAPPDATA%\Nullraptor\actualizar.log.
# -SinActualizar quita la tarea y se recuerda; -ConActualizar la vuelve a poner.
param([switch]$Red, [switch]$SoloEquipo, [switch]$Tailscale, [switch]$SinTailscale, [string[]]$Carpeta, [switch]$SinCarpetas,
  [switch]$Actualizar, [switch]$SinActualizar, [switch]$ConActualizar)
$imagen = if ($env:NULLRAPTOR_IMAGEN) { $env:NULLRAPTOR_IMAGEN } else { 'ghcr.io/nulldanosaurio/nullraptor:main' }
$cofre = if ($env:CREDENCIALES) { $env:CREDENCIALES } else { Join-Path $HOME '.nullraptor\credenciales.cifrado' }
$guardada = Join-Path $env:LOCALAPPDATA 'Nullraptor\clave.dpapi'

$registroAct = Join-Path $env:LOCALAPPDATA 'Nullraptor\actualizar.log'
function Anotar($mensaje) {
  if ((Test-Path $registroAct) -and (Get-Item $registroAct).Length -gt 1MB) { Remove-Item $registroAct }
  "$(Get-Date -Format s) $mensaje" | Add-Content $registroAct
}
# Con -Actualizar no hay nadie delante: se anota y se sale sin esperar.
function Salir($mensaje, $codigo = 1) {
  if ($Actualizar) { Anotar $mensaje; exit $codigo }
  Write-Host $mensaje; Read-Host 'Pulsa Intro para cerrar' | Out-Null; exit $codigo
}
function Refrescar-Path { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }
function Docker-Listo { docker info *> $null; return $LASTEXITCODE -eq 0 }
$nombre = 'nullraptor'
$puerto = if ($env:PANEL_PUERTO) { $env:PANEL_PUERTO } else { '4321' }
$url = "http://localhost:$puerto"
$archivoRed = Join-Path $env:LOCALAPPDATA 'Nullraptor\red'
New-Item -ItemType Directory -Force (Split-Path $archivoRed) | Out-Null
if ($Red) { New-Item -ItemType File -Force $archivoRed | Out-Null } elseif ($SoloEquipo) { Remove-Item $archivoRed -ErrorAction SilentlyContinue }
$enRed = if (Test-Path $archivoRed) { '1' } else { '0' }
$archivoTs = Join-Path $env:LOCALAPPDATA 'Nullraptor\tailscale'
if ($Tailscale) { New-Item -ItemType File -Force $archivoTs | Out-Null } elseif ($SinTailscale) { Remove-Item $archivoTs -ErrorAction SilentlyContinue }
$dominio = ''

# Carpetas de Windows recordadas (una ruta por línea). Se rechaza cualquiera que contenga el cofre o la clave.
$archivoCarpetas = Join-Path $env:LOCALAPPDATA 'Nullraptor\carpetas'
if ($SinCarpetas) { Remove-Item $archivoCarpetas -ErrorAction SilentlyContinue }
function Contiene($padre, $ruta) { return ($ruta.TrimEnd('\') + '\').StartsWith($padre.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase) }
if ($Carpeta) {
  $lista = @(if (Test-Path $archivoCarpetas) { Get-Content $archivoCarpetas })
  foreach ($c in $Carpeta) {
    if (-not (Test-Path -LiteralPath $c -PathType Container)) { Salir "No existe la carpeta ${c}." }
    $c = (Resolve-Path -LiteralPath $c).ProviderPath.TrimEnd('\')
    if ((Contiene $c $cofre) -or (Contiene $c (Split-Path $guardada))) { Salir "No monto ${c}: contiene el cofre o la clave de Nullraptor. Elige una carpeta más concreta." }
    if ($lista -notcontains $c) { $lista += $c }
  }
  $lista | Set-Content $archivoCarpetas
}
$carpetas = @(if (Test-Path $archivoCarpetas) { Get-Content $archivoCarpetas | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Container) } })
$montaCarpetas = @(); $usados = @{}
foreach ($c in $carpetas) {
  $n = (Split-Path $c -Leaf) -replace '[^A-Za-z0-9._-]', '_'
  if (-not $n.Trim('_')) { $n = $c.Substring(0, 1) }   # raíz de una unidad, p. ej. D:\ -> /pc/D
  $base = $n; for ($i = 2; $usados.ContainsKey($n); $i++) { $n = "$base-$i" }
  $usados[$n] = 1
  $montaCarpetas += '-v', "${c}:/pc/$n"
}
$etiquetaCarpetas = $carpetas -join '|'
# 127.0.0.1 y no localhost: .NET prueba antes ::1, que no está publicado, y agota la espera.
function Panel-Listo { try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 "http://127.0.0.1:$puerto" | Out-Null; return $true } catch { return $false } }
function Abrir-Panel {
  if ($dominio) {
    Write-Host "`nDesde tus dispositivos con Tailscale: https://$dominio (con passkey)."
    docker exec $nombre test -s /estado/home/.nullraptor/passkeys.json *> $null
    if ($LASTEXITCODE) {
      $codigoTs = (docker exec $nombre cat /estado/home/.nullraptor/panel-codigo).Trim()
      Write-Host "  Primera passkey: abre https://$dominio/entrar en tu móvil y escribe el código $codigoTs"
    }
  }
  if ($enRed -eq '1') {
    # Este navegador entra solo (el código va en la dirección una vez); los demás de casa lo escriben.
    $codigo = (docker exec $nombre cat /estado/home/.nullraptor/panel-codigo).Trim()
    Start-Process "$url/entrar?codigo=$codigo"
    Write-Host "`nNullraptor en marcha, abierto a la red de casa. Desde otro navegador:"
    Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } |
      ForEach-Object { Write-Host "  http://$($_.IPv4Address.IPAddress):$puerto   ($($_.InterfaceAlias))" }
    Write-Host "  Código de acceso: $codigo   (cada navegador lo pide una vez)"
    Write-Host 'Para volver a solo este equipo: lanzador con -SoloEquipo.'
  } else {
    Start-Process $url
    Write-Host "`nNullraptor en marcha: $url (solo este equipo; para la red de casa, lanzador con -Red)."
  }
  Write-Host "Sigue funcionando aunque cierres esta ventana. Para pararlo: docker stop $nombre (o desde Docker Desktop)."
  if ($enRed -eq '1') { Read-Host 'Pulsa Intro para cerrar' | Out-Null } else { Start-Sleep -Seconds 5 }
  exit 0
}
# Modo red: Windows bloquea por defecto las conexiones entrantes; una regla solo para redes privadas (pide administrador).
function Abrir-Firewall {
  if (Get-NetFirewallRule -DisplayName 'Nullraptor (panel)' -ErrorAction SilentlyContinue) { return }
  Write-Host 'Abriendo el puerto del panel en el firewall de Windows, solo para redes privadas (acepta el aviso de administrador)...'
  $orden = "New-NetFirewallRule -DisplayName 'Nullraptor (panel)' -Direction Inbound -Protocol TCP -LocalPort $puerto -Profile Private -Action Allow"
  try { Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile', '-Command', $orden } catch { Write-Host 'Aviso: sin la regla, los otros equipos no llegarán al panel.' }
}

# Tailscale: el panel sigue publicado solo en 127.0.0.1; «tailscale serve» lo sirve por HTTPS a tu tailnet.
function Preparar-Tailscale {
  $ts = (Get-Command tailscale -ErrorAction SilentlyContinue).Source
  if (-not $ts) { $ts = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe' }
  if (-not (Test-Path $ts)) { Salir 'Tailscale no está instalado: https://tailscale.com/download (y en el móvil, su app). Inicia sesión con la misma cuenta.' }
  $estado = & $ts status --json | ConvertFrom-Json
  if ($estado.BackendState -ne 'Running') { Salir 'Tailscale no está conectado: ábrelo e inicia sesión.' }
  $script:dominio = $estado.Self.DNSName.TrimEnd('.').ToLower()
  & $ts serve --bg --https=443 "http://127.0.0.1:$puerto" | Out-Null
  if ($LASTEXITCODE) { Salir "tailscale serve ha fallado. Activa MagicDNS y los certificados HTTPS en https://login.tailscale.com/admin/dns y vuelve a probar." }
}
# Con -Actualizar, Tailscale ya sirve el panel (serve --bg): el dominio se toma del contenedor, más abajo.
if (-not $Actualizar -and (Test-Path $archivoTs)) { Preparar-Tailscale }
elseif ($SinTailscale) { $ts = (Get-Command tailscale -ErrorAction SilentlyContinue).Source; if ($ts) { & $ts serve --https=443 off *> $null } }

# 1. Docker en marcha.
Refrescar-Path
if ($Actualizar -and -not ((Get-Command docker -ErrorAction SilentlyContinue) -and (Docker-Listo))) { exit 0 } # sin Docker: ya se hará
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

# Actualización automática: solo si hay imagen nueva y nadie está trabajando (o se ha pedido desde el panel).
if ($Actualizar) {
  if ((docker inspect -f '{{.State.Running}}' $nombre 2>$null) -ne 'true') { exit 0 } # parado a propósito: no se toca
  # En JSON: PowerShell 5.1 estropea las comillas dobles dentro de los argumentos de otros programas.
  $dominio = "$((docker inspect -f '{{json .Config.Labels}}' $nombre | ConvertFrom-Json).'nullraptor.dominio')".Trim()
  docker pull -q $imagen *> $null
  if ($LASTEXITCODE) { Anotar "Sin acceso a $imagen; se reintenta luego."; exit 0 }
  $dir = '/estado/trabajo/actualizacion'
  $enMarcha = "$(docker inspect -f '{{.Image}}' $nombre)".Trim()
  $nueva = "$(docker image inspect -f '{{.Id}}' $imagen)".Trim()
  if ($enMarcha -eq $nueva) { docker exec $nombre rm -f "$dir/disponible.json" "$dir/solicitada.json" *> $null; exit 0 }
  # El aviso para el panel, con la fecha en que se vio por primera vez.
  $previo = $(try { (docker exec $nombre cat "$dir/disponible.json" 2>$null) | ConvertFrom-Json } catch { $null })
  if (-not $previo -or $previo.imagen -ne $nueva) {
    @{ imagen = $nueva; fecha = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json -Compress |
      docker exec -i $nombre sh -c "mkdir -p $dir && cat > $dir/disponible.json"
    Anotar "Imagen nueva: $nueva"
  }
  docker exec $nombre test -f "$dir/solicitada.json" *> $null
  $pedida = -not $LASTEXITCODE
  $panel = $(try { (docker exec $nombre cat "$dir/panel.json" 2>$null) | ConvertFrom-Json } catch { $null })
  # Sin noticias del panel en 5 minutos, está colgado: se actualiza igual. Sin panel.json (versión anterior), se espera.
  $mudo = $panel -and ((Get-Date) - [datetime]$panel.fecha).TotalMinutes -gt 5
  $libre = $panel -and $panel.sesiones -eq 0
  if (-not ($pedida -or $libre -or $mudo)) { exit 0 }
  Anotar "Actualizando ($(if ($pedida) { 'pedido desde el panel' } elseif ($libre) { 'sin sesiones abiertas' } else { 'el panel no responde' }))."
  docker exec $nombre rm -f "$dir/disponible.json" "$dir/solicitada.json" *> $null
}

# Si ya está en marcha, solo se abre el navegador.
if (-not $Actualizar -and (docker inspect -f '{{.State.Running}} {{index .Config.Labels "nullraptor.red"}} {{index .Config.Labels "nullraptor.dominio"}} {{index .Config.Labels "nullraptor.carpetas"}}' $nombre 2>$null) -eq "true $enRed $dominio $etiquetaCarpetas" -and (Panel-Listo)) { Abrir-Panel }

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
if (-not $ok -and $Actualizar) { Salir 'No hay clave recordada que abra el cofre: arranca Nullraptor a mano una vez.' }
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
# La tarea de actualización se registra desde la copia instalada (sin permisos de administrador: es de tu usuario).
$tarea = 'Nullraptor (actualizar)'
$archivoSinAct = Join-Path $env:LOCALAPPDATA 'Nullraptor\sin-actualizar'
if ($ConActualizar) { Remove-Item $archivoSinAct -ErrorAction SilentlyContinue }
if ($SinActualizar) {
  New-Item -ItemType File -Force $archivoSinAct | Out-Null
  Unregister-ScheduledTask -TaskName $tarea -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host 'Actualización automática desactivada (-ConActualizar la vuelve a poner).'
} elseif ($PSCommandPath -eq $instalado -and -not $Actualizar -and -not (Test-Path $archivoSinAct) -and -not (Get-ScheduledTask -TaskName $tarea -ErrorAction SilentlyContinue)) {
  try {
    # conhost --headless: sin ventana que aparezca cada 5 minutos.
    $accion = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument "--headless powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$instalado`" -Actualizar"
    $cuando = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Minutes 5)
    $ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
    Register-ScheduledTask -TaskName $tarea -Action $accion -Trigger $cuando -Settings $ajustes -Description 'Instala las versiones nuevas de Nullraptor cuando no hay sesiones abiertas.' | Out-Null
    Write-Host 'Actualización automática activada (cada 5 minutos; -SinActualizar la quita).'
  } catch { Write-Host "Aviso: no se pudo programar la actualización automática ($($_.Exception.Message))." }
}
if ($PSCommandPath -eq $instalado) {
  $tmp = docker create $imagen
  if (-not $LASTEXITCODE) { docker cp "${tmp}:/nullraptor/scripts/arrancar.ps1" $instalado *> $null; docker rm $tmp *> $null }
}

# 5. Servidor y panel web dentro del contenedor, en segundo plano. Todo lo del equipo queda en el volumen
#    nullraptor (/estado). El puerto se publica solo en este equipo (127.0.0.1) o, en modo red, en la red de casa.
docker rm -f $nombre *> $null
$publica = if ($enRed -eq '1') { Abrir-Firewall; "${puerto}:4321" } else { "127.0.0.1:${puerto}:4321" }
docker run -d --name $nombre --label "nullraptor.red=$enRed" --label "nullraptor.dominio=$dominio" -e AGENTE_CLAVE -e "PANEL_RED=$enRed" -e "PANEL_DOMINIO=$dominio" --label "nullraptor.carpetas=$etiquetaCarpetas" -v nullraptor:/estado -v $montaCofre @montaCarpetas -p $publica $imagen node panel/servidor.mjs | Out-Null
$codigo = $LASTEXITCODE
Remove-Item Env:AGENTE_CLAVE -ErrorAction SilentlyContinue
if ($codigo) { Salir "No se pudo arrancar el contenedor ($codigo). ¿Está ocupado el puerto $puerto?" $codigo }
Write-Host 'Preparando la memoria y los proyectos (la primera vez tarda un poco)...'
for ($i = 0; -not (Panel-Listo); $i++) {
  if ((docker inspect -f '{{.State.Running}}' $nombre 2>$null) -ne 'true') { docker logs --tail 30 $nombre; Salir 'Nullraptor se ha parado al arrancar (arriba, su registro).' }
  if ($i -ge 180) { Salir "El panel no responde tras 6 minutos. Registro: docker logs $nombre" }
  Start-Sleep -Seconds 2
}
if ($Actualizar) { Anotar "Actualizado a $nueva."; exit 0 }
foreach ($c in $carpetas) { Write-Host "Carpeta para la IA: $c" }
Abrir-Panel
