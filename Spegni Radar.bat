@echo off
rem Spegne il motore del Radar Geopolitico (il processo pythonw che esegue server.py).
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='pythonw.exe'\" | Where-Object { $_.CommandLine -like ('*' + '%~dp0' + 'server.py*') -or $_.CommandLine -like '*radar-geopolitico*server.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
echo Radar spento.
ping -n 3 127.0.0.1 >nul
