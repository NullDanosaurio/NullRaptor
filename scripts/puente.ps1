# Puente de Nullraptor con el PC: la IA del contenedor usa el equipo como lo haría una persona.
# Lo arranca el lanzador (arrancar.ps1) en segundo plano, sin ventana y sin permisos de administrador: corre como el
# usuario de Windows de Daniel, con su escritorio (capturas, ratón y teclado) y sus programas.
# Escucha solo en 127.0.0.1 (el contenedor llega por host.docker.internal; desde la red no se ve) y exige el token
# de %LOCALAPPDATA%\Nullraptor\puente.token, que el lanzador pasa al contenedor (NULLRAPTOR_PUENTE_TOKEN).
# Protocolo: una línea JSON { token, orden, args } → una línea JSON { ok, resultado | error }. Lado del contenedor:
# scripts/pc.mjs.
# Dos modos (decisión [U] 02/11/2026):
#   completo  (por defecto) también ejecutar (PowerShell libre), iniciar, enviar/traer archivos, captura, ventanas,
#             enfocar, ratón y teclado. La aprobación de cada orden la da Claude Code, que en las sesiones del panel
#             pregunta antes de cada orden.
#   consulta  solo las órdenes de consulta (ORDENES_CONSULTA). Se activa con el archivo puente-consulta junto al token
#             (lanzador -PuenteConsulta; -PuenteCompleto lo quita). Se mira en cada petición: el corte es inmediato, y
#             en consulta la IA no puede ejecutar nada para quitarlo.
# Una orden cada vez: mientras dura una larga (ejecutar), las demás esperan.
# Registro en %LOCALAPPDATA%\Nullraptor\puente.log. Una sola copia a la vez (mutex); deja PID y huella en puente.pid
# para que el lanzador la cambie cuando este archivo cambie.
param([int]$Puerto = 4329)
$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:LOCALAPPDATA 'Nullraptor'
$archivoToken = Join-Path $dir 'puente.token'
$registro = Join-Path $dir 'puente.log'
$archivoConsulta = Join-Path $dir 'puente-consulta'
$ORDENES_CONSULTA = 'estado', 'sistema', 'procesos', 'puertos', 'programas', 'winget-buscar', 'abrir-url', 'notificar'
$MAX_TROZO = 8MB   # enviar/traer van por trozos de hasta esto: sin límite de tamaño de archivo y con poca memoria
$MAX_SALIDA = 2MB

$mutex = [Threading.Mutex]::new($false, 'Local\NullraptorPuente')
if (-not $mutex.WaitOne(0)) { exit 0 } # ya hay otro
$token = (Get-Content $archivoToken -Raw).Trim()
if ($token.Length -lt 32) { exit 1 }
"$PID $((Get-FileHash $PSCommandPath -Algorithm SHA256).Hash)" | Set-Content (Join-Path $dir 'puente.pid')

# Escritorio: coordenadas en píxeles reales (sin el escalado de Windows) para que capturas y ratón coincidan.
Add-Type -AssemblyName System.Windows.Forms, System.Drawing, System.Web.Extensions
# JSON sin el límite de ~2 MB de ConvertFrom-Json/ConvertTo-Json en PowerShell 5.1 (capturas y archivos lo pasan).
$json = [Web.Script.Serialization.JavaScriptSerializer]::new(); $json.MaxJsonLength = [int]::MaxValue; $json.RecursionLimit = 100
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
namespace Nullraptor {
  public struct Rect { public int Left, Top, Right, Bottom; }
  public static class U32 {
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint f, int dx, int dy, int d, UIntPtr e);
    [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint f, UIntPtr e);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out Rect r);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  }
}
'@
[Nullraptor.U32]::SetProcessDPIAware() | Out-Null

function Anotar([string]$texto) {
  try {
    if ((Test-Path $registro) -and (Get-Item $registro).Length -gt 1MB) { Move-Item -Force $registro "$registro.1" }
    Add-Content $registro "$((Get-Date).ToString('s')) $texto"
  } catch { }
}

function Texto($args_, [string]$clave, [int]$max, [string]$patron = '(?s).*') {
  $v = "$($args_.$clave)"
  if (-not $v -or $v.Length -gt $max -or $v -notmatch "^(?:$patron)$") { throw "Falta o no vale «$clave»." }
  return $v
}
function Entero($args_, [string]$clave, [int]$min, [int]$max, $defecto = $null) {
  $v = $args_.$clave
  if ($null -eq $v -or "$v" -eq '') { if ($null -ne $defecto) { return $defecto } throw "Falta «$clave»." }
  $n = 0
  if (-not [int]::TryParse("$v", [ref]$n) -or $n -lt $min -or $n -gt $max) { throw "«$clave» tiene que ser un número entre $min y $max." }
  return $n
}
function Largo($args_, [string]$clave, $defecto) {
  $v = $args_.$clave
  if ($null -eq $v -or "$v" -eq '') { return [long]$defecto }
  $n = [long]0
  if (-not [long]::TryParse("$v", [ref]$n) -or $n -lt 0) { throw "«$clave» tiene que ser un número de 0 en adelante." }
  return $n
}
function Ruta($args_, [string]$clave) {
  $v = Texto $args_ $clave 1000
  if (-not [IO.Path]::IsPathRooted($v)) { throw "«$clave» tiene que ser una ruta completa de Windows (C:\…)." }
  return $v
}
function Recortar([string]$t) { if ($t.Length -gt $MAX_SALIDA) { $t.Substring(0, $MAX_SALIDA) + "`n[… recortado a $($MAX_SALIDA / 1MB) MB]" } else { $t } }

# PowerShell libre en un proceso aparte (si falla o se cuelga, el puente sigue), con tiempo máximo y salida en UTF-8.
function Correr-Script([string]$script, [string]$cwd, [int]$segundos) {
  $archivo = Join-Path $env:TEMP "nullraptor-$([guid]::NewGuid().ToString('N')).ps1"
  $prologo = "[Console]::OutputEncoding = [Text.Encoding]::UTF8; `$OutputEncoding = [Text.Encoding]::UTF8; `$ProgressPreference = 'SilentlyContinue'`n"
  [IO.File]::WriteAllText($archivo, $prologo + $script, [Text.UTF8Encoding]::new($true))
  try {
    $psi = [Diagnostics.ProcessStartInfo]::new('powershell.exe', "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$archivo`"")
    $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true; $psi.RedirectStandardInput = $true
    $psi.StandardOutputEncoding = [Text.Encoding]::UTF8; $psi.StandardErrorEncoding = [Text.Encoding]::UTF8
    if ($cwd) { $psi.WorkingDirectory = $cwd }
    $p = [Diagnostics.Process]::Start($psi)
    $p.StandardInput.Close()
    $salida = $p.StandardOutput.ReadToEndAsync(); $errores = $p.StandardError.ReadToEndAsync()
    $agotado = -not $p.WaitForExit($segundos * 1000)
    if ($agotado) { & taskkill.exe /T /F /PID $p.Id *> $null }
    $p.WaitForExit()
    @{ codigo = $(if ($agotado) { $null } else { $p.ExitCode }); agotado = $agotado; salida = (Recortar $salida.Result); errores = (Recortar $errores.Result) }
  } finally { Remove-Item $archivo -ErrorAction SilentlyContinue }
}

function Buscar-Ventana([string]$titulo) {
  $v = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -like "*$([Management.Automation.WildcardPattern]::Escape($titulo))*" } | Select-Object -First 1
  if (-not $v) { throw "No hay ninguna ventana con «$titulo» en el título (mira «ventanas»)." }
  return $v
}
function Rect-De($h) { $r = New-Object Nullraptor.Rect; [Nullraptor.U32]::GetWindowRect($h, [ref]$r) | Out-Null; return $r }

# Texto literal para SendKeys: sus caracteres especiales van entre llaves y los saltos de línea son Intro.
function Escapar-Teclas([string]$t) {
  ($t.ToCharArray() | ForEach-Object { if ('+^%~(){}[]'.Contains([string]$_)) { "{$_}" } elseif ($_ -eq "`n") { '{ENTER}' } elseif ($_ -eq "`r") { '' } else { [string]$_ } }) -join ''
}
$RATON = @{ izquierdo = 0x02, 0x04; derecho = 0x08, 0x10; central = 0x20, 0x40 }
function Pulsar([string]$boton) { $f = $RATON[$boton]; [Nullraptor.U32]::mouse_event($f[0], 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 30; [Nullraptor.U32]::mouse_event($f[1], 0, 0, 0, [UIntPtr]::Zero) }

$ordenes = [ordered]@{
  estado = { param($a)
    $modo = if (Test-Path $archivoConsulta) { 'consulta' } else { 'completo' }
    @{ puente = 'nullraptor'; modo = $modo; ordenes = @(if ($modo -eq 'consulta') { $ORDENES_CONSULTA } else { $ordenes.Keys }) }
  }
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

  # —— Control completo ——
  ejecutar = { param($a)
    $script = Texto $a 'script' 1MB
    $cwd = if ($a.cwd) { Ruta $a 'cwd' } else { $env:USERPROFILE }
    Correr-Script $script $cwd (Entero $a 'tiempo' 1 1800 120)
  }
  iniciar = { param($a)
    $o = @{ FilePath = (Texto $a 'programa' 1000); PassThru = $true }
    if ($a.args) { $o.ArgumentList = @($a.args | ForEach-Object { "$_" }) }
    if ($a.cwd) { $o.WorkingDirectory = (Ruta $a 'cwd') }
    $p = Start-Process @o
    @{ pid = $p.Id; programa = $o.FilePath }
  }
  # Archivos por trozos (pc.mjs los parte): cada trozo es una petición, así que el puente atiende otras órdenes entre
  # medias y nunca tiene más de un trozo en memoria. Al acabar se da el SHA-256 para comprobarlo en el contenedor.
  enviar = { param($a)
    $destino = Ruta $a 'destino'
    $parcial = "$destino.parcial"
    $posicion = Largo $a 'posicion' 0
    $b64 = "$($a.datos)"
    if ($b64.Length -gt $MAX_TROZO * 1.4) { throw "Trozo de más de $($MAX_TROZO / 1MB) MB." }
    $bytes = [Convert]::FromBase64String($b64)
    if ($posicion -eq 0) {
      $carpeta = Split-Path $destino
      if ($carpeta) { New-Item -ItemType Directory -Force $carpeta | Out-Null }
      Remove-Item -LiteralPath $parcial -ErrorAction SilentlyContinue
    }
    $fs = [IO.File]::Open($parcial, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::Write)
    try {
      if ($fs.Length -ne $posicion) { throw "El trozo empieza en $posicion, pero hay $($fs.Length) bytes recibidos: vuelve a enviar desde el principio." }
      $fs.Seek($posicion, [IO.SeekOrigin]::Begin) | Out-Null
      $fs.Write($bytes, 0, $bytes.Length)
    } finally { $fs.Close() }
    if ($a.final -eq $true) {
      Move-Item -LiteralPath $parcial -Destination $destino -Force
      @{ destino = $destino; bytes = (Get-Item -LiteralPath $destino).Length; sha256 = (Get-FileHash -LiteralPath $destino -Algorithm SHA256).Hash.ToLower() }
    } else { @{ recibido = $posicion + $bytes.Length } }
  }
  traer = { param($a)
    $origen = Ruta $a 'origen'
    $i = Get-Item -LiteralPath $origen
    if ($i.PSIsContainer) { throw "$origen es una carpeta: comprímela antes con ejecutar (Compress-Archive)." }
    $posicion = Largo $a 'posicion' 0
    $quedan = [math]::Max([long]0, $i.Length - $posicion)
    $buf = New-Object byte[] ([long][math]::Min([long](Entero $a 'tamano' 1 $MAX_TROZO $MAX_TROZO), $quedan))
    $fs = [IO.File]::Open($origen, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
    try {
      $fs.Seek($posicion, [IO.SeekOrigin]::Begin) | Out-Null
      $n = 0
      while ($n -lt $buf.Length) { $leidos = $fs.Read($buf, $n, $buf.Length - $n); if ($leidos -le 0) { break }; $n += $leidos }
    } finally { $fs.Close() }
    $r = @{ origen = $origen; total = $i.Length; posicion = $posicion; datos = [Convert]::ToBase64String($buf, 0, $n) }
    if ($posicion + $n -ge $i.Length) { $r.sha256 = (Get-FileHash -LiteralPath $origen -Algorithm SHA256).Hash.ToLower() }
    $r
  }
  ventanas = { param($a)
    ,@(Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } | ForEach-Object {
      $r = Rect-De $_.MainWindowHandle
      @{ titulo = $_.MainWindowTitle; proceso = $_.ProcessName; pid = $_.Id; minimizada = [Nullraptor.U32]::IsIconic($_.MainWindowHandle); x = $r.Left; y = $r.Top; ancho = $r.Right - $r.Left; alto = $r.Bottom - $r.Top }
    })
  }
  enfocar = { param($a)
    $v = Buscar-Ventana (Texto $a 'ventana' 200)
    $h = $v.MainWindowHandle
    if ([Nullraptor.U32]::IsIconic($h)) { [Nullraptor.U32]::ShowWindow($h, 9) | Out-Null } # SW_RESTORE
    # Windows no deja a un proceso de fondo pasar otra ventana al frente; una pulsación de Alt lo desbloquea.
    [Nullraptor.U32]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero); [Nullraptor.U32]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
    $ok = [Nullraptor.U32]::SetForegroundWindow($h)
    @{ titulo = $v.MainWindowTitle; enfocada = $ok }
  }
  captura = { param($a)
    if ($a.ventana) {
      $v = Buscar-Ventana (Texto $a 'ventana' 200)
      $r = Rect-De $v.MainWindowHandle
      $x = $r.Left; $y = $r.Top; $w = $r.Right - $r.Left; $h = $r.Bottom - $r.Top
    } else {
      $vs = [Windows.Forms.SystemInformation]::VirtualScreen
      $x = $vs.X; $y = $vs.Y; $w = $vs.Width; $h = $vs.Height
    }
    if ($w -le 0 -or $h -le 0) { throw 'La ventana no está visible (¿minimizada? usa enfocar).' }
    $bmp = [Drawing.Bitmap]::new($w, $h)
    $g = [Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($x, $y, 0, 0, $bmp.Size); $g.Dispose()
    $max = Entero $a 'ancho' 200 8000 1600
    $escala = 1.0
    if ($w -gt $max) {
      $escala = $max / $w
      $peq = [Drawing.Bitmap]::new($bmp, [int]($w * $escala), [int]($h * $escala)); $bmp.Dispose(); $bmp = $peq
    }
    $ms = [IO.MemoryStream]::new(); $bmp.Save($ms, [Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
    # Un punto (px, py) de la imagen está en la pantalla en (x + px / escala, y + py / escala).
    @{ x = $x; y = $y; ancho = $w; alto = $h; escala = [math]::Round($escala, 6); png = [Convert]::ToBase64String($ms.ToArray()) }
  }
  raton = { param($a)
    $accion = Texto $a 'accion' 20 'mover|clic|doble|derecho|central|arrastrar|rueda'
    $x = Entero $a 'x' -32768 32767; $y = Entero $a 'y' -32768 32767
    [Nullraptor.U32]::SetCursorPos($x, $y) | Out-Null
    Start-Sleep -Milliseconds 50
    switch ($accion) {
      'clic' { Pulsar 'izquierdo' }
      'doble' { Pulsar 'izquierdo'; Start-Sleep -Milliseconds 80; Pulsar 'izquierdo' }
      'derecho' { Pulsar 'derecho' }
      'central' { Pulsar 'central' }
      'rueda' { [Nullraptor.U32]::mouse_event(0x0800, 0, 0, 120 * (Entero $a 'cantidad' -50 50 -3), [UIntPtr]::Zero) }
      'arrastrar' {
        $x2 = Entero $a 'x2' -32768 32767; $y2 = Entero $a 'y2' -32768 32767
        [Nullraptor.U32]::mouse_event(0x02, 0, 0, 0, [UIntPtr]::Zero)
        for ($i = 1; $i -le 20; $i++) { [Nullraptor.U32]::SetCursorPos($x + ($x2 - $x) * $i / 20, $y + ($y2 - $y) * $i / 20) | Out-Null; Start-Sleep -Milliseconds 15 }
        [Nullraptor.U32]::mouse_event(0x04, 0, 0, 0, [UIntPtr]::Zero)
      }
    }
    @{ accion = $accion; x = $x; y = $y }
  }
  teclado = { param($a)
    # texto: se escribe tal cual. teclas: sintaxis de SendKeys ({ENTER}, ^s = Ctrl+S, %{F4} = Alt+F4, +{TAB}…).
    if ($a.texto) { $envio = Escapar-Teclas (Texto $a 'texto' 20000) } else { $envio = Texto $a 'teclas' 2000 }
    [Windows.Forms.SendKeys]::SendWait($envio)
    @{ enviado = $envio.Length }
  }
}

# Las órdenes que dan listas las devuelven con «,@(...)»: si no, PowerShell desenvuelve la de un solo elemento.
function Contestar($flujo, $datos) {
  # Si algún valor no lo sabe serializar (p. ej. un objeto de PowerShell), ConvertTo-Json, que sí, aunque con límite.
  $texto = try { $json.Serialize($datos) } catch { $datos | ConvertTo-Json -Depth 8 -Compress }
  $bytes = [Text.Encoding]::UTF8.GetBytes($texto + "`n")
  $flujo.Write($bytes, 0, $bytes.Length)
}

function Atender($cliente) {
  $cliente.ReceiveTimeout = 120000; $cliente.SendTimeout = 120000
  $flujo = $cliente.GetStream()
  $lector = [IO.StreamReader]::new($flujo, [Text.Encoding]::UTF8)
  $linea = $lector.ReadLine()
  if (-not $linea -or $linea.Length -gt $MAX_TROZO * 2) { return }
  try { $p = $json.DeserializeObject($linea); if ($p -isnot [Collections.IDictionary]) { throw 'no es un objeto' } } catch { Contestar $flujo @{ ok = $false; error = 'Petición no válida.' }; return }
  if ("$($p.token)" -cne $token) { Anotar 'rechazada: token incorrecto'; Contestar $flujo @{ ok = $false; error = 'Token no válido.' }; return }
  $orden = "$($p.orden)"
  if (-not $ordenes.Contains($orden)) { Anotar "rechazada: $orden"; Contestar $flujo @{ ok = $false; error = "Orden no permitida: $orden. Permitidas: $(@($ordenes.Keys) -join ', ')." }; return }
  if ((Test-Path $archivoConsulta) -and $ORDENES_CONSULTA -notcontains $orden) {
    Anotar "rechazada (modo consulta): $orden"
    Contestar $flujo @{ ok = $false; error = "El control completo del PC está desactivado (modo solo consulta). Solo Daniel lo vuelve a activar, en Windows: lanzador con -PuenteCompleto." }
    return
  }
  $a = if ($p.args -is [Collections.IDictionary]) { $p.args } else { @{} }
  # En el registro, sin el contenido de los archivos y con los scripts recortados.
  $copia = @{}; foreach ($k in @($a.Keys)) { if ($k -ne 'datos') { $copia[$k] = $a[$k] } }
  $nota = $json.Serialize($copia)
  Anotar "orden: $orden $(if ($nota.Length -gt 600) { $nota.Substring(0, 600) + '…' } else { $nota })"
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
