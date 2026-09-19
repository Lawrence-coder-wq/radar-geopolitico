@echo off
rem Accende il Radar Geopolitico e lo apre nel browser. Se e' gia' acceso, apre solo la pagina.
cd /d "%~dp0"
start "" pythonw "%~dp0server.py" --apri
