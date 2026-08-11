# Lanzador de Nagimi AI (Opciones) — arranca el server si hace falta y abre el navegador.
$ErrorActionPreference = "SilentlyContinue"
# Ruta relativa al propio script: así renombrar o mover la carpeta no rompe el lanzador.
$web = Join-Path $PSScriptRoot "web"

# Resolver npm (Node instalado por winget suele estar en Program Files\nodejs).
$npm = "$env:ProgramFiles\nodejs\npm.cmd"
if (-not (Test-Path $npm)) {
  $npm = "npm.cmd"
  $env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
}

function Test-Up {
  try { Invoke-WebRequest "http://localhost:3000" -UseBasicParsing -TimeoutSec 3 | Out-Null; return $true }
  catch { return $false }
}

# Si no responde, arranca el server (ventana minimizada, para poder cerrarla luego).
if (-not (Test-Up)) {
  Start-Process -FilePath $npm -ArgumentList "run","dev" -WorkingDirectory $web -WindowStyle Minimized
  for ($i = 0; $i -lt 45; $i++) { if (Test-Up) { break }; Start-Sleep -Seconds 1 }
}

# Abrir el navegador por defecto en la app.
Start-Process "http://localhost:3000"
