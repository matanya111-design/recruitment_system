# Auto-start recruitment system Docker containers on Windows login
Start-Sleep -Seconds 20  # wait for Docker Desktop to be ready
Set-Location "C:\Users\MatanyaVinograd\my_project\recruitment_system"
docker compose up -d 2>&1 | Out-File ".docker-startup.log" -Encoding UTF8
