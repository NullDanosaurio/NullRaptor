@echo off
rem Doble clic para arrancar Nullraptor en este equipo (sin Docker). La clave se pide solo la primera vez.
title Nullraptor
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\arrancar.ps1"
