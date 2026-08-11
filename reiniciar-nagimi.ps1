# Reinicia Nagimi AI: cierra CUALQUIER servidor viejo, arranca UNO limpio y abre el navegador.
# Úsalo si Nagimi se pone lenta, da 404, o después de cambiar la cookie de MarketSnack.
$ErrorActionPreference = "SilentlyContinue"

# Ruta relativa al propio script: sobrevive si renombras o mueves la carpeta.
$web = Join-Path $PSScriptRoot "web"

# Resolver npm (Node de winget suele estar en Program Files\nodejs).
$npm = "$env:ProgramFiles\nodejs\npm.cmd"
if (-not (Test-Path $npm)) {
  $npm = "npm.cmd"
  $env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
}

# 1) Cerrar TODO servidor de Nagimi que esté escuchando en 3000-3005 (evita el problema
#    de dos servidores peleando por la misma carpeta .next, que es lo que la rompe).
foreach ($port in 3000..3005) {
  $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($c in $conns) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }
}
Start-Sleep -Seconds 2

# 2) Borrar la caché de build para arrancar 100% limpio.
$next = Join-Path $web ".next"
if (Test-Path $next) { Remove-Item -Recurse -Force $next -ErrorAction SilentlyContinue }

# 3) Arrancar UN servidor nuevo (ventana minimizada, para poder cerrarla después).
Start-Process -FilePath $npm -ArgumentList "run","dev" -WorkingDirectory $web -WindowStyle Minimized

# 4) Esperar a que responda en el 3000 y abrir el navegador.
for ($i = 0; $i -lt 60; $i++) {
  try { Invoke-WebRequest "http://localhost:3000" -UseBasicParsing -TimeoutSec 2 | Out-Null; break }
  catch { Start-Sleep -Seconds 1 }
}
Start-Process "http://localhost:3000"
