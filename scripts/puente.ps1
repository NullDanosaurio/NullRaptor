# Puente de Nullraptor con el PC: deja que la IA del contenedor consulte el equipo con una lista blanca de órdenes.
# Lo arranca el lanzador (arrancar.ps1) en segundo plano, sin ventana y sin permisos de administrador.
# Escucha solo en 127.0.0.1 (el contenedor llega por host.docker.internal; desde la red no se ve) y exige el token
# de %LOCALAPPDATA%\Nullraptor\puente.token, que el lanzador pasa al contenedor (NULLRAPTOR_PUENTE_TOKEN).
# Protocolo: una línea JSON { token, orden, args } → una línea JSON { ok, resultado | error }. Lado del contenedor:
# scripts/pc.mjs. Nada de órdenes libres ni de instalar: cada orden es un bloque fijo con sus argumentos validados.
# Registro en %LOCALAPPDATA%\Nullraptor\puente.log. Una sola copia a la vez (mutex); deja PID y huella en puente.pid
# para que el lanzador la cambie cuando este archivo cambie.
param([int]$Puerto = 4329)
$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:LOCALAPPDATA 'Nullraptor'
$archivoToken = Join-Path $dir 'puente.token'
$registro = Join-Path $dir 'puente.log'

$mutex = [Threading.Mutex]::new($false, 'Local\NullraptorPuente')
if (-not $mutex.WaitOne(0)) { exit 0 } # ya hay otro
$token = (Get-Content $archivoToken -Raw).Trim()
if ($token.Length -lt 32) { exit 1 }
"$PID $((Get-FileHash $PSCommandPath -Algorithm SHA256).Hash)" | Set-Content (Join-Path $dir 'puente.pid')

function Anotar([string]$texto) {
  try {
    if ((Test-Path $registro) -and (Get-Item $registro).Length -gt 1MB) { Move-Item -Force $registro "$registro.1" }
    Add-Content $registro "$((Get-Date).ToString('s')) $texto"
  } catch { }
}

function Texto($args_, [string]$clave, [int]$max, [string]$patron = '.*') {
  $v = "$($args_.$clave)"
  if (-not $v -or $v.Length -gt $max -or $v -notmatch "^(?:$patron)$") { throw "Falta o no vale «$clave»." }
  return $v
}

$ordenes = [ordered]@{
  estado = { param($a) @{ puente = 'nullraptor'; ordenes = @($ordenes.Keys) } }
  sistema = { param($a)
    $so = Get-CimInstance Win32_OperatingSystem
    $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
    @{
      equipo = $env:COMPUTERNAME; usuario = $env:USERNAME
      windows = "$($so.Caption) $($so.Version)"; cpu = $cpu.Name.Trim(); nucleos = $cpu.NumberOfLogicalProcessors
      memoriaGB = [math]::Round($so.TotalVisibleMemorySize / 1MB, 1); libreGB = [math]::Round($so.FreePhysicalMemory / 1MB, 1)
      discos = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object { @{ unidad = $_.DeviceID; totalGB = [math]::Round($_.Size / 1GB, 1); libreGB = [math]::Round($_.FreeSpace / 1GB, 1) } })
    }
  }
  procesos = { param($a)
    ,@(Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 40 | ForEach-Object { @{ nombre = $_.ProcessName; pid = $_.Id; memoriaMB = [math]::Round($_.WorkingSet64 / 1MB) } })
  }
  puertos = { param($a)
    $nombres = @{}; Get-Process | ForEach-Object { $nombres[$_.Id] = $_.ProcessName }
    ,@(Get-NetTCPConnection -State Listen | Sort-Object LocalPort -Unique | ForEach-Object { @{ direccion = $_.LocalAddress; puerto = $_.LocalPort; proceso = $nombres[[int]$_.OwningProcess] } })
  }
  programas = { param($a)
    $filtro = if ($a.filtro) { Texto $a 'filtro' 80 } else { $null }
    $claves = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
    ,@(Get-ItemProperty $claves -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -and (-not $filtro -or $_.DisplayName -like "*$([Management.Automation.WildcardPattern]::Escape($filtro))*") } |
      Sort-Object DisplayName -Unique | ForEach-Object { @{ nombre = $_.DisplayName; version = $_.DisplayVersion } })
  }
  'winget-buscar' = { param($a)
    $q = Texto $a 'texto' 60 '[\w .+-]{2,60}'
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { throw 'winget no está en este PC.' }
    # winget escribe UTF-8; sin esto se lee con la página de la consola y los acentos salen rotos.
    $antes = [Console]::OutputEncoding
    try { [Console]::OutputEncoding = [Text.Encoding]::UTF8; (& winget search --query $q --accept-source-agreements --disable-interactivity 2>&1 | Out-String).Trim() }
    finally { [Console]::OutputEncoding = $antes }
  }
  'abrir-url' = { param($a)
    $url = Texto $a 'url' 2000 'https?://[^\s"''<>]+'
    Start-Process ([uri]$url).AbsoluteUri
    "Abierta: $url"
  }
  notificar = { param($a)
    $texto = Texto $a 'texto' 300
    $titulo = if ($a.titulo) { Texto $a 'titulo' 60 } else { 'Nullraptor' }
    # En un proceso aparte (el aviso necesita unos segundos) y con los textos en Base64: nada de lo recibido se ejecuta.
    $b = { param($t) [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($t)) }
    $script = "Add-Type -AssemblyName System.Windows.Forms,System.Drawing; `$d = { param(`$x) [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(`$x)) }; " +
      "`$n = New-Object System.Windows.Forms.NotifyIcon; `$n.Icon = [System.Drawing.SystemIcons]::Information; `$n.Visible = `$true; " +
      "`$n.ShowBalloonTip(10000, (& `$d '$(& $b $titulo)'), (& `$d '$(& $b $texto)'), 'Info'); Start-Sleep 10; `$n.Dispose()"
    Start-Process powershell.exe -WindowStyle Hidden -ArgumentList '-NoProfile', '-EncodedCommand', ([Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script)))
    'Aviso mostrado.'
  }
}

# Las órdenes que dan listas las devuelven con «,@(...)»: si no, PowerShell desenvuelve la de un solo elemento.
function Contestar($flujo, $datos) {
  $bytes = [Text.Encoding]::UTF8.GetBytes(($datos | ConvertTo-Json -Depth 6 -Compress) + "`n")
  $flujo.Write($bytes, 0, $bytes.Length)
}

function Atender($cliente) {
  $cliente.ReceiveTimeout = 5000; $cliente.SendTimeout = 10000
  $flujo = $cliente.GetStream()
  $lector = [IO.StreamReader]::new($flujo, [Text.Encoding]::UTF8)
  $linea = $lector.ReadLine()
  if (-not $linea -or $linea.Length -gt 65536) { return }
  try { $p = $linea | ConvertFrom-Json } catch { Contestar $flujo @{ ok = $false; error = 'Petición no válida.' }; return }
  if ("$($p.token)" -cne $token) { Anotar 'rechazada: token incorrecto'; Contestar $flujo @{ ok = $false; error = 'Token no válido.' }; return }
  $orden = "$($p.orden)"
  if (-not $ordenes.Contains($orden)) { Anotar "rechazada: $orden"; Contestar $flujo @{ ok = $false; error = "Orden no permitida: $orden. Permitidas: $(@($ordenes.Keys) -join ', ')." }; return }
  $a = if ($p.args) { $p.args } else { [pscustomobject]@{} }
  Anotar "orden: $orden $(($a | ConvertTo-Json -Compress -Depth 2))"
  try { Contestar $flujo @{ ok = $true; resultado = (& $ordenes[$orden] $a) } }
  catch { Contestar $flujo @{ ok = $false; error = "$($_.Exception.Message)" } }
}

$escucha = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Puerto)
try { $escucha.Start() } catch { Anotar "no se pudo escuchar en el puerto ${Puerto}: $($_.Exception.Message)"; exit 1 }
Anotar "en marcha en 127.0.0.1:$Puerto (PID $PID)"
while ($true) {
  $cliente = $escucha.AcceptTcpClient()
  try { Atender $cliente } catch { Anotar "error: $($_.Exception.Message)" } finally { $cliente.Close() }
}
