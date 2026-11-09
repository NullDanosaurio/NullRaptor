# Lanzador de Nullraptor en Windows: doble clic y listo. Siempre dentro de Docker, nunca sobre el sistema.
# Arranca Docker Desktop si hace falta, actualiza la imagen, levanta el contenedor con el servidor y el panel, y abre
# el panel en una ventana propia, como una aplicación (Edge o Chrome en modo app: sin pestañas ni barra de direcciones).
# La clave del cofre se pide solo la primera vez y se recuerda cifrada con DPAPI (solo tu usuario de Windows en
# este equipo puede leerla). Si deja de abrir el cofre, se olvida y se vuelve a pedir.
# El instalador copia este archivo a %LOCALAPPDATA%\Nullraptor; tras cada actualización se refresca desde la imagen.
#
# Acceso (red de casa, Tailscale) y carpetas de Windows para la IA: se cambian en el panel, Ajustes. El panel deja
# el pedido en el volumen ($TRABAJO_DIR/equipo/pedido.json) y este lanzador lo aplica, al abrirlo o en su tarea de
# cada 5 minutos (cuando no hay sesiones abiertas, o en seguida si se pide «ahora»), y deja el resultado para el panel.
#   Red de casa: otros navegadores de casa, con código de acceso (abre una regla del firewall solo para redes privadas).
#   Tailscale: desde cualquier parte, solo tus dispositivos, con passkey («tailscale serve»: HTTPS en tu tailnet; nunca Funnel).
#   Carpetas: cada una se monta con lectura y escritura en /pc/<nombre>. Nunca una que contenga el cofre o la clave.
# Rescate, si el panel no responde: -SoloEquipo (sin red de casa), -SinTailscale, -SinCarpetas. Siguen valiendo
# -Red, -Tailscale y -Carpeta 'C:\ruta' (se recuerdan igual que desde Ajustes).
# Actualización automática: la copia instalada registra la tarea «Nullraptor (actualizar)», que cada 5 minutos lo
# ejecuta con -Actualizar (sin ventana ni preguntas). Si hay imagen nueva o ajustes pedidos, recrea el contenedor con
# los mismos ajustes cuando no hay sesiones de Claude abiertas o cuando se pide desde el panel; si no, el panel avisa.
# Si el contenedor está parado no lo arranca. Registro en %LOCALAPPDATA%\Nullraptor\actualizar.log.
# -SinActualizar quita la tarea y se recuerda; -ConActualizar la vuelve a poner.
# Puente con el PC: -PuenteConsulta corta el control completo al momento (solo órdenes de consulta) y se recuerda;
# -PuenteCompleto lo devuelve. Solo desde Windows: en consulta la IA no puede ejecutar nada para quitarlo.
param([switch]$Red, [switch]$SoloEquipo, [switch]$Tailscale, [switch]$SinTailscale, [string[]]$Carpeta, [switch]$SinCarpetas,
  [switch]$Actualizar, [switch]$SinActualizar, [switch]$ConActualizar, [switch]$PuenteConsulta, [switch]$PuenteCompleto)
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
function En-Marcha { return (docker inspect -f '{{.State.Running}}' $nombre 2>$null) -eq 'true' }
$nombre = 'nullraptor'
$puerto = if ($env:PANEL_PUERTO) { $env:PANEL_PUERTO } else { '4321' }
# Apps de los proyectos (Roleplay en 4777). Solo en este equipo (127.0.0.1), también en modo red: no piden acceso.
# NULLRAPTOR_PUERTOS cambia la lista (p. ej. «4777,5173»). Dentro del contenedor la app escucha en 0.0.0.0.
$listaApps = if ($env:NULLRAPTOR_PUERTOS) { $env:NULLRAPTOR_PUERTOS } else { '4777' }
$puertosApps = @($listaApps -split '[,; ]+' | Where-Object { $_ -match '^\d{2,5}$' })
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
# Comprueba una carpeta y la devuelve normalizada (sin barra final; la raíz de una unidad queda «D:»), o lanza el motivo.
function Validar-Carpeta($c) {
  if (-not (Test-Path -LiteralPath $c -PathType Container)) { throw "No existe la carpeta ${c}." }
  $c = (Resolve-Path -LiteralPath $c).ProviderPath.TrimEnd('\')
  if ((Contiene $c $cofre) -or (Contiene $c (Split-Path $guardada))) { throw "No monto ${c}: contiene el cofre o la clave de Nullraptor. Elige una carpeta más concreta." }
  return $c
}
if ($Carpeta) {
  $lista = @(if (Test-Path $archivoCarpetas) { Get-Content $archivoCarpetas })
  foreach ($c in $Carpeta) {
    try { $c = Validar-Carpeta $c } catch { Salir $_.Exception.Message }
    if ($lista -notcontains $c) { $lista += $c }
  }
  $lista | Set-Content $archivoCarpetas
}
# Montajes (-v) y etiqueta de las carpetas recordadas que existen.
function Calcular-Carpetas {
  $script:carpetas = @(if (Test-Path $archivoCarpetas) { Get-Content $archivoCarpetas | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Container) } })
  $script:montaCarpetas = @(); $usados = @{}
  foreach ($c in $script:carpetas) {
    $n = (Split-Path $c -Leaf) -replace '[^A-Za-z0-9._-]', '_'
    if (-not $n.Trim('_')) { $n = $c.Substring(0, 1) }   # raíz de una unidad, p. ej. D: -> /pc/D
    $base = $n; for ($i = 2; $usados.ContainsKey($n); $i++) { $n = "$base-$i" }
    $usados[$n] = 1
    $origen = if ($c -match '^[A-Za-z]:$') { "$c\" } else { $c }   # «D:\», no «D:», para que Docker entienda el montaje
    $script:montaCarpetas += '-v', "${origen}:/pc/$n"
  }
  $script:etiquetaCarpetas = $script:carpetas -join '|'
}
Calcular-Carpetas

# Puente con el PC (scripts/puente.ps1): la IA del contenedor consulta este equipo con una lista blanca de órdenes
# (scripts/pc.mjs). Escucha solo en 127.0.0.1; el contenedor llega por host.docker.internal con el token de
# puente.token, que se crea una vez. Se arranca en cada pasada (también la de -Actualizar) si no está vivo, y se
# cambia por uno nuevo cuando puente.ps1 cambia. Registro en %LOCALAPPDATA%\Nullraptor\puente.log.
$puertoPuente = if ($env:NULLRAPTOR_PUERTO_PUENTE -match '^\d{2,5}$') { $env:NULLRAPTOR_PUERTO_PUENTE } else { '4329' }
$archivoPuente = Join-Path $PSScriptRoot 'puente.ps1'
$tokenPuente = Join-Path $env:LOCALAPPDATA 'Nullraptor\puente.token'
$archivoConsulta = Join-Path $env:LOCALAPPDATA 'Nullraptor\puente-consulta'
if ($PuenteConsulta) { New-Item -ItemType File -Force $archivoConsulta | Out-Null; Write-Host 'Puente con el PC en modo solo consulta (-PuenteCompleto lo devuelve).' }
elseif ($PuenteCompleto) { Remove-Item $archivoConsulta -ErrorAction SilentlyContinue; Write-Host 'Puente con el PC en modo completo: la IA puede usar el PC (Claude pregunta antes de cada orden).' }
function Arrancar-Puente {
  if (-not (Test-Path $archivoPuente)) { return }
  try {
    if (-not (Test-Path $tokenPuente)) {
      $b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
      (($b | ForEach-Object { $_.ToString('x2') }) -join '') | Set-Content $tokenPuente
    }
    $pidPuente = Join-Path $env:LOCALAPPDATA 'Nullraptor\puente.pid'
    $antes = @(if (Test-Path $pidPuente) { (Get-Content $pidPuente -Raw).Trim() -split ' ' })
    # Solo cuenta si ese PID sigue siendo el puente (un PID viejo puede ser ya otro programa).
    $vivo = $antes.Count -eq 2 -and $antes[0] -match '^\d+$' -and "$((Get-CimInstance Win32_Process -Filter "ProcessId=$($antes[0])").CommandLine)" -like '*puente.ps1*'
    if ($vivo -and $antes[1] -eq (Get-FileHash $archivoPuente -Algorithm SHA256).Hash) { return }
    if ($vivo) { Stop-Process -Id $antes[0] -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 500 }
    # conhost --headless: sin ventana. Sigue vivo aunque se cierre el lanzador.
    Start-Process conhost.exe -ArgumentList '--headless', 'powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$archivoPuente`"", '-Puerto', $puertoPuente
  } catch { Anotar "Puente con el PC: $($_.Exception.Message)" }
}

# 127.0.0.1 y no localhost: .NET prueba antes ::1, que no está publicado, y agota la espera.
function Panel-Listo { try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 "http://127.0.0.1:$puerto" | Out-Null; return $true } catch { return $false } }

# El panel en una ventana propia, como una aplicación: Edge (viene con Windows) o Chrome en modo app, con un perfil
# aparte en %LOCALAPPDATA%\Nullraptor\ventana. Sin ninguno de los dos, el navegador de siempre.
function Abrir-Ventana($destino) {
  $candidatos = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe")
  $navegador = $candidatos | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $navegador) { Start-Process $destino; return }
  $perfil = Join-Path $env:LOCALAPPDATA 'Nullraptor\ventana'
  # Comillas a mano: PowerShell 5.1 no las pone en -ArgumentList y la ruta puede llevar espacios.
  Start-Process $navegador -ArgumentList "--app=$destino", "--user-data-dir=`"$perfil`"", '--no-first-run', '--no-default-browser-check', '--window-size=1280,860'
}

function Abrir-Panel {
  Entregar-Resultado
  if ($dominio) {
    Write-Host "`nDesde tus dispositivos con Tailscale: https://$dominio (con passkey)."
    docker exec $nombre test -s /estado/home/.nullraptor/passkeys.json *> $null
    if ($LASTEXITCODE) {
      $codigoTs = (docker exec $nombre cat /estado/home/.nullraptor/panel-codigo).Trim()
      Write-Host "  Primera passkey: abre https://$dominio/entrar en tu móvil y escribe el código $codigoTs"
    }
  }
  if ($enRed -eq '1') {
    # Esta ventana entra sola (el código va en la dirección una vez); los demás navegadores de casa lo escriben.
    $codigo = (docker exec $nombre cat /estado/home/.nullraptor/panel-codigo).Trim()
    Abrir-Ventana "$url/entrar?codigo=$codigo"
    Write-Host "`nNullraptor en marcha, abierto a la red de casa. Desde otro navegador:"
    Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } |
      ForEach-Object { Write-Host "  http://$($_.IPv4Address.IPAddress):$puerto   ($($_.InterfaceAlias))" }
    Write-Host "  Código de acceso: $codigo   (cada navegador lo pide una vez)"
  } else {
    Abrir-Ventana $url
    Write-Host "`nNullraptor en marcha: $url"
  }
  Write-Host 'El acceso y las carpetas se cambian en el panel, Ajustes.'
  Write-Host "Sigue funcionando aunque cierres esta ventana. Para pararlo: docker stop $nombre (o desde Docker Desktop)."
  if ($enRed -eq '1') { Read-Host 'Pulsa Intro para cerrar' | Out-Null } else { Start-Sleep -Seconds 5 }
  exit 0
}
# Modo red: Windows bloquea por defecto las conexiones entrantes; una regla solo para redes privadas (pide administrador).
function Hay-Firewall { return [bool](Get-NetFirewallRule -DisplayName 'Nullraptor (panel)' -ErrorAction SilentlyContinue) }
function Abrir-Firewall {
  if ((Hay-Firewall) -or $Actualizar) { return }   # la tarea no puede pedir administrador: lo hará el próximo arranque a mano
  Write-Host 'Abriendo el puerto del panel en el firewall de Windows, solo para redes privadas (acepta el aviso de administrador)...'
  $orden = "New-NetFirewallRule -DisplayName 'Nullraptor (panel)' -Direction Inbound -Protocol TCP -LocalPort $puerto -Profile Private -Action Allow"
  try { Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile', '-Command', $orden } catch { Write-Host 'Aviso: sin la regla, los otros equipos no llegarán al panel.' }
}

# Tailscale: el panel sigue publicado solo en 127.0.0.1; «tailscale serve» lo sirve por HTTPS a tu tailnet.
# Devuelve $null si queda listo, o el motivo si no.
function Ruta-Tailscale {
  $ts = (Get-Command tailscale -ErrorAction SilentlyContinue).Source
  if (-not $ts) { $ts = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe' }
  if (Test-Path $ts) { return $ts } else { return $null }
}
function Preparar-Tailscale {
  $ts = Ruta-Tailscale
  if (-not $ts) { return 'Tailscale no está instalado: https://tailscale.com/download (y en el móvil, su app). Inicia sesión con la misma cuenta.' }
  $estado = & $ts status --json | ConvertFrom-Json
  if ($estado.BackendState -ne 'Running') { return 'Tailscale no está conectado: ábrelo e inicia sesión.' }
  $script:dominio = $estado.Self.DNSName.TrimEnd('.').ToLower()
  & $ts serve --bg --https=443 "http://127.0.0.1:$puerto" | Out-Null
  if ($LASTEXITCODE) { $script:dominio = ''; return 'tailscale serve ha fallado. Activa MagicDNS y los certificados HTTPS en https://login.tailscale.com/admin/dns y vuelve a probar.' }
  return $null
}
function Quitar-Tailscale { $ts = Ruta-Tailscale; if ($ts) { & $ts serve --https=443 off *> $null }; $script:dominio = '' }
# Con -Actualizar, Tailscale ya sirve el panel (serve --bg): el dominio se toma del contenedor, más abajo.
if (-not $Actualizar -and (Test-Path $archivoTs)) { $e = Preparar-Tailscale; if ($e) { Salir $e } }
elseif ($SinTailscale) { Quitar-Tailscale }

# Ajustes pedidos desde el panel (Ajustes). Ver panel/lib/equipo.mjs.
$dirEquipo = '/estado/trabajo/equipo'
$resultado = $null
function Leer-Pedido {
  $texto = if (En-Marcha) { docker exec $nombre cat "$dirEquipo/pedido.json" 2>$null }
    else { docker run --rm -v nullraptor:/estado --entrypoint cat $imagen "$dirEquipo/pedido.json" 2>$null }
  if ($LASTEXITCODE -or -not $texto) { return $null }
  try { $p = ($texto -join "`n") | ConvertFrom-Json } catch { return $null }
  if ("$($p.id)" -notmatch '^[0-9a-f-]{36}$') { return $null }
  return $p
}
# Todo o nada: si una carpeta o Tailscale fallan, no cambia nada. Deja el resultado listo para entregarlo al panel.
function Aplicar-Pedido($p) {
  $avisos = @()
  try {
    $nuevas = @()
    foreach ($c in @($p.carpetas)) { if ($c) { $c = Validar-Carpeta $c; if ($nuevas -notcontains $c) { $nuevas += $c } } }
    if ($p.tailscale) { $e = Preparar-Tailscale; if ($e) { throw $e } } elseif ($dominio) { Quitar-Tailscale }
  } catch {
    $script:resultado = [ordered]@{ id = $p.id; fecha = (Get-Date).ToUniversalTime().ToString('o'); estado = 'error'; mensaje = $_.Exception.Message; avisos = @() }
    return $false
  }
  if ($p.red) { New-Item -ItemType File -Force $archivoRed | Out-Null } else { Remove-Item $archivoRed -ErrorAction SilentlyContinue }
  if ($p.tailscale) { New-Item -ItemType File -Force $archivoTs | Out-Null } else { Remove-Item $archivoTs -ErrorAction SilentlyContinue }
  if ($nuevas.Count) { $nuevas | Set-Content $archivoCarpetas } else { Remove-Item $archivoCarpetas -ErrorAction SilentlyContinue }
  $script:enRed = if ($p.red) { '1' } else { '0' }
  Calcular-Carpetas
  if ($p.red -and $Actualizar -and -not (Hay-Firewall)) { $avisos += 'Falta la regla del firewall de Windows: abre el lanzador una vez en el PC (pide administrador) o los otros equipos de casa no llegarán.' }
  $script:resultado = [ordered]@{ id = $p.id; fecha = (Get-Date).ToUniversalTime().ToString('o'); estado = 'aplicado'; mensaje = 'Aplicado.'; avisos = $avisos }
  return $true
}
# Deja el resultado en el volumen y retira el pedido si sigue siendo el mismo (pudo llegar otro mientras).
function Entregar-Resultado {
  if (-not $script:resultado -or -not (En-Marcha)) { return }
  $r = $script:resultado; $script:resultado = $null
  $r | ConvertTo-Json -Compress | docker exec -i $nombre sh -c "mkdir -p $dirEquipo && cat > $dirEquipo/resultado.json"
  docker exec $nombre sh -c "grep -q '$($r.id)' $dirEquipo/pedido.json 2>/dev/null && rm -f $dirEquipo/pedido.json" *> $null
  if ($Actualizar) { Anotar "Ajustes del panel: $($r.estado). $($r.mensaje) $($r.avisos -join ' ')" }
  elseif ($r.estado -eq 'error') { Write-Host "No se aplicaron los ajustes pedidos en el panel: $($r.mensaje)" }
}

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

Arrancar-Puente

# Actualización automática y ajustes pedidos: solo si hay algo nuevo y nadie está trabajando (o se ha pedido «ahora»).
if ($Actualizar) {
  if (-not (En-Marcha)) { exit 0 } # parado a propósito: no se toca
  # En JSON: PowerShell 5.1 estropea las comillas dobles dentro de los argumentos de otros programas.
  $dominio = "$((docker inspect -f '{{json .Config.Labels}}' $nombre | ConvertFrom-Json).'nullraptor.dominio')".Trim()
  docker pull -q $imagen *> $null
  if ($LASTEXITCODE) { Anotar "Sin acceso a $imagen; se reintenta luego." }
  $dir = '/estado/trabajo/actualizacion'
  $enMarcha = "$(docker inspect -f '{{.Image}}' $nombre)".Trim()
  $nueva = "$(docker image inspect -f '{{.Id}}' $imagen 2>$null)".Trim()
  $hayImagen = $nueva -and $enMarcha -ne $nueva
  $pedido = Leer-Pedido
  if (-not $hayImagen) { docker exec $nombre rm -f "$dir/disponible.json" "$dir/solicitada.json" *> $null }
  if (-not $hayImagen -and -not $pedido) { exit 0 }
  if ($hayImagen) {
    # El aviso para el panel, con la fecha en que se vio por primera vez.
    $previo = $(try { (docker exec $nombre cat "$dir/disponible.json" 2>$null) | ConvertFrom-Json } catch { $null })
    if (-not $previo -or $previo.imagen -ne $nueva) {
      @{ imagen = $nueva; fecha = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json -Compress |
        docker exec -i $nombre sh -c "mkdir -p $dir && cat > $dir/disponible.json"
      Anotar "Imagen nueva: $nueva"
    }
  }
  docker exec $nombre test -f "$dir/solicitada.json" *> $null
  $pedida = (-not $LASTEXITCODE) -or ($pedido -and $pedido.ahora)
  $panel = $(try { (docker exec $nombre cat "$dir/panel.json" 2>$null) | ConvertFrom-Json } catch { $null })
  # Sin noticias del panel en 5 minutos, está colgado: se actualiza igual. Sin panel.json (versión anterior), se espera.
  $mudo = $panel -and ((Get-Date) - [datetime]$panel.fecha).TotalMinutes -gt 5
  $libre = $panel -and $panel.sesiones -eq 0
  if (-not ($pedida -or $libre -or $mudo)) { exit 0 }
  if ($pedido -and -not (Aplicar-Pedido $pedido) -and -not $hayImagen) { Entregar-Resultado; exit 0 } # nada que hacer: solo avisar
  Anotar "Recreando ($(if ($hayImagen) { 'imagen nueva' } else { 'ajustes del panel' }); $(if ($pedida) { 'pedido desde el panel' } elseif ($libre) { 'sin sesiones abiertas' } else { 'el panel no responde' }))."
  docker exec $nombre rm -f "$dir/disponible.json" "$dir/solicitada.json" *> $null
} else {
  $pedido = Leer-Pedido
  if ($pedido) { Aplicar-Pedido $pedido | Out-Null }
}

# Si ya está en marcha con estos ajustes, solo se abre la ventana.
if (-not $Actualizar -and (docker inspect -f '{{.State.Running}} {{index .Config.Labels "nullraptor.red"}} {{index .Config.Labels "nullraptor.dominio"}} {{index .Config.Labels "nullraptor.carpetas"}}' $nombre 2>$null) -eq "true $enRed $dominio $etiquetaCarpetas" -and (Panel-Listo)) { Abrir-Panel }

# 2. Imagen al día. Sin internet o sin acceso al registro, se usa la que ya haya en el equipo.
if (-not $Actualizar) {
  Write-Host "Comprobando $imagen..."
  docker pull -q $imagen *> $null
  if ($LASTEXITCODE) {
    docker image inspect $imagen *> $null
    if ($LASTEXITCODE) { Salir "No se pudo descargar $imagen. Ejecuta de nuevo el instalador (inicia sesión en el registro)." }
    Write-Host 'Aviso: no se pudo actualizar la imagen; uso la que hay en el equipo.'
  }
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
  Write-Host 'Actualización automática desactivada (-ConActualizar la vuelve a poner). Los ajustes del panel se aplicarán al abrir el lanzador.'
} elseif ($PSCommandPath -eq $instalado -and -not $Actualizar -and -not (Test-Path $archivoSinAct) -and -not (Get-ScheduledTask -TaskName $tarea -ErrorAction SilentlyContinue)) {
  try {
    # conhost --headless: sin ventana que aparezca cada 5 minutos.
    $accion = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument "--headless powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$instalado`" -Actualizar"
    $cuando = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Minutes 5)
    $ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
    Register-ScheduledTask -TaskName $tarea -Action $accion -Trigger $cuando -Settings $ajustes -Description 'Instala las versiones nuevas de Nullraptor y los ajustes pedidos en el panel cuando no hay sesiones abiertas.' | Out-Null
    Write-Host 'Actualización automática activada (cada 5 minutos; -SinActualizar la quita).'
  } catch { Write-Host "Aviso: no se pudo programar la actualización automática ($($_.Exception.Message))." }
}
if ($PSCommandPath -eq $instalado) {
  $tmp = docker create $imagen
  if (-not $LASTEXITCODE) {
    docker cp "${tmp}:/nullraptor/scripts/arrancar.ps1" $instalado *> $null
    docker cp "${tmp}:/nullraptor/scripts/puente.ps1" (Join-Path (Split-Path $instalado) 'puente.ps1') *> $null
    docker rm $tmp *> $null
  }
}

# 5. Servidor y panel web dentro del contenedor, en segundo plano. Todo lo del equipo queda en el volumen
#    nullraptor (/estado). El puerto se publica solo en este equipo (127.0.0.1) o, en modo red, en la red de casa.
#    Los de las apps ($puertosApps), siempre solo en este equipo.
#    NULLRAPTOR_LANZADOR y NULLRAPTOR_CARPETAS le dicen al panel (Ajustes) cómo está montado.
# Parada ordenada antes de recrearlo: el panel recibe SIGTERM, apunta las sesiones abiertas y las cierra; al volver
# las reabre con su conversación (reanudar.json). Con «rm -f» directo morían a la fuerza y no quedaba nada.
docker stop -t 30 $nombre *> $null
docker rm -f $nombre *> $null
# Puente con el PC: dirección y token para la IA (el token, por el entorno como la clave, no en los argumentos).
$conPuente = @()
if (Test-Path $tokenPuente) {
  $env:NULLRAPTOR_PUENTE_TOKEN = (Get-Content $tokenPuente -Raw).Trim()
  $conPuente = '-e', "NULLRAPTOR_PUENTE=host.docker.internal:$puertoPuente", '-e', 'NULLRAPTOR_PUENTE_TOKEN'
}
# Perfil seccomp de la imagen (el de Docker más los namespaces sin privilegios): sin él, el sandbox de Codex (bwrap) no
# puede arrancar dentro del contenedor y Codex no escribe archivos. Se saca de la imagen en cada arranque; si falla se
# usa la copia anterior, y sin ninguna se arranca con el perfil por defecto de Docker.
$perfilSeccomp = Join-Path $env:LOCALAPPDATA 'Nullraptor\seccomp.json'
$copia = docker create $imagen 2>$null
if ($LASTEXITCODE -eq 0 -and $copia) {
  docker cp "${copia}:/nullraptor/config/seccomp.json" $perfilSeccomp *> $null
  docker rm $copia *> $null
}
$conSeccomp = if (Test-Path $perfilSeccomp) { @('--security-opt', "seccomp=$perfilSeccomp") } else { Write-Host 'Aviso: sin el perfil seccomp, Codex no podrá usar su sandbox.'; @() }
$publica = if ($enRed -eq '1') { Abrir-Firewall; "${puerto}:4321" } else { "127.0.0.1:${puerto}:4321" }
$publicaApps = @(foreach ($p in $puertosApps) { '-p'; "127.0.0.1:${p}:${p}" })
docker run -d --init --name $nombre --label "nullraptor.red=$enRed" --label "nullraptor.dominio=$dominio" --label "nullraptor.carpetas=$etiquetaCarpetas" `
  @conSeccomp -e AGENTE_CLAVE @conPuente -e "PANEL_RED=$enRed" -e "PANEL_DOMINIO=$dominio" -e NULLRAPTOR_LANZADOR=windows -e "NULLRAPTOR_CARPETAS=$etiquetaCarpetas" `
  -v nullraptor:/estado -v $montaCofre @montaCarpetas -p $publica @publicaApps $imagen node panel/servidor.mjs | Out-Null
$codigo = $LASTEXITCODE
Remove-Item Env:AGENTE_CLAVE, Env:NULLRAPTOR_PUENTE_TOKEN -ErrorAction SilentlyContinue
if ($codigo) { Salir "No se pudo arrancar el contenedor ($codigo). ¿Está ocupado el puerto $puerto o alguno de $($puertosApps -join ', ')?" $codigo }
Write-Host 'Preparando la memoria y los proyectos (la primera vez tarda un poco)...'
for ($i = 0; -not (Panel-Listo); $i++) {
  if (-not (En-Marcha)) { docker logs --tail 30 $nombre; Salir 'Nullraptor se ha parado al arrancar (arriba, su registro).' }
  if ($i -ge 180) { Salir "El panel no responde tras 6 minutos. Registro: docker logs $nombre" }
  Start-Sleep -Seconds 2
}
Entregar-Resultado
if ($Actualizar) { Anotar "Contenedor recreado$(if ($hayImagen) { " con $nueva" })."; exit 0 }
foreach ($c in $carpetas) { Write-Host "Carpeta para la IA: $c" }
Abrir-Panel
