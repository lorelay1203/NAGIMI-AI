# Reinicia Nagimi AI: cierra el servidor viejo, arranca uno nuevo y abre el navegador.
# Úsalo después de cambiar la cookie de MarketSnack en .env.local.
$ErrorActionPreference = "SilentlyContinue"
$web = "C:\Users\lorel\OneDrive\Escritorio\Nagimi AI\1 - App Opciones (localhost 3000)\web"
$npm = "$env:ProgramFiles\nodejs\npm.cmd"
if (-not (Test-Path $npm)) {
  $npm = "npm.cmd"
  $env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
}

# Cerrar el servidor Node que esté corriendo.
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force

# Arrancar de nuevo (ventana minimizada, para poder cerrarla después).
Start-Process -FilePath $npm -ArgumentList "run","dev" -WorkingDirectory $web -WindowStyle Minimized

# Esperar a que responda y abrir el navegador.
for ($i = 0; $i -lt 45; $i++) {
  try { Invoke-WebRequest "http://localhost:3000" -UseBasicParsing -TimeoutSec 2 | Out-Null; break }
  catch { Start-Sleep -Seconds 1 }
}
Start-Process "http://localhost:3000"
