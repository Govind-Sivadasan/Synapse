#Requires -Version 5.1
<#
.SYNOPSIS
  Run the Synapse stack with common Docker Compose workflows.

.EXAMPLE
  .\scripts\run.ps1
  .\scripts\run.ps1 up -Detach -Build
  .\scripts\run.ps1 dev
  .\scripts\run.ps1 down -Volumes
  .\scripts\run.ps1 logs -Service backend -Follow
  .\scripts\run.ps1 health
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet("up", "down", "restart", "logs", "ps", "health", "build", "dev", "env", "help")]
    [string]$Command = "up",

    [switch]$Build,
    [switch]$Detach,
    [switch]$Infra,
    [switch]$Volumes,
    [switch]$KeepOllama,
    [switch]$NoOllama,
    [switch]$Follow,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Service
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Remaining args after Command (e.g. "restart frontend keycloak")
if ($Service -and $Service.Count -gt 0) {
    $Service = @($Service)
    # Guard: positional bind sometimes splits a single name into characters
    if ($Service.Count -gt 1 -and ($Service | Where-Object { $_.Length -gt 1 }).Count -eq 0) {
        $Service = @(-join $Service)
    }
}

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

$InfraServices = @(
    "postgres",
    "redis",
    "keycloak",
    "orthanc-onprem",
    "orthanc-cloud"
)
$OllamaService = "ollama"
$AppServices = @(
    "backend",
    "celery-routing",
    "celery-migration",
    "frontend"
)
$AllServices = $InfraServices + $OllamaService + $AppServices

function Write-Info([string]$Message) {
    Write-Host "[synapse] $Message" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
    Write-Host "[synapse] $Message" -ForegroundColor Green
}

function Write-Warn([string]$Message) {
    Write-Host "[synapse] $Message" -ForegroundColor Yellow
}

function Write-Err([string]$Message) {
    Write-Host "[synapse] $Message" -ForegroundColor Red
}

function Test-Docker {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw "Docker is not installed or not on PATH. Install Docker Desktop and retry."
    }
    $null = docker info 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Docker daemon is not running. Start Docker Desktop and retry."
    }
}

function Ensure-EnvFile {
    $envFile = Join-Path $Root ".env"
    $example = Join-Path $Root ".env.example"
    if (Test-Path $envFile) {
        return
    }
    if (-not (Test-Path $example)) {
        throw ".env is missing and .env.example was not found."
    }
    Copy-Item $example $envFile
    Write-Warn "Created .env from .env.example - review secrets before production use."
}

function Get-TargetServices {
    if ($Service -and $Service.Count -gt 0) {
        return @($Service)
    }
    if ($Infra) {
        $selected = [System.Collections.Generic.List[string]]::new()
        $selected.AddRange($InfraServices)
        if (-not $NoOllama) { $selected.Add($OllamaService) }
        return @($selected.ToArray())
    }
    if ($NoOllama) {
        return @($InfraServices + $AppServices)
    }
    return @($AllServices)
}

$ComposeVolumeNames = @(
    "postgres_data",
    "orthanc_onprem_data",
    "orthanc_cloud_data",
    "ollama_data",
    "temp_dicom"
)
$OllamaVolumeName = "ollama_data"

function Get-ComposeProjectName {
    if ($env:COMPOSE_PROJECT_NAME) {
        return $env:COMPOSE_PROJECT_NAME
    }
    return (Split-Path -Leaf $Root).ToLower()
}

function Invoke-ComposeDown {
    if ($Volumes -and $KeepOllama) {
        throw "Use -Volumes or -KeepOllama, not both."
    }
    if ($Volumes) {
        Write-Warn "Removing all volumes - database, Orthanc, Ollama model cache, and temp storage will be wiped."
        docker compose down -v
        return
    }

    docker compose down
    if (-not $KeepOllama) {
        return
    }

    $project = Get-ComposeProjectName
    Write-Warn "Removing data volumes except Ollama (ollama_data / model cache preserved)."
    foreach ($volume in $ComposeVolumeNames) {
        if ($volume -eq $OllamaVolumeName) {
            continue
        }
        $fullName = "${project}_${volume}"
        $null = docker volume rm $fullName 2>&1
    }
}

function Show-Help {
    @'
Synapse run script

Usage:
  run.bat [command] [options]          REM Windows CMD
  .\scripts\run.ps1 [command] [options]   REM PowerShell

Commands:
  up        Start services (default). Foreground unless -Detach.
  down      Stop services. Use -Volumes or -KeepOllama to remove data volumes.
  restart   Restart services (down then up). With -Service or service names, restart only those containers.
  logs      Tail service logs. Use -Service and -Follow.
  ps        Show container status.
  health    Call the backend health endpoint.
  build     Build images without starting containers.
  dev       Start stack without the frontend container; run Vite locally.
  env       Ensure .env exists (copy from .env.example if needed).
  help      Show this help.

Options:
  -Build       Rebuild images before start.
  -Detach      Run containers in the background (-d).
  -Infra       Start only infrastructure (postgres, redis, keycloak, orthanc, ollama).
  -NoOllama    Skip the Ollama service (faster startup; chatbot unavailable).
  -Volumes     With 'down': remove all named volumes (including Ollama model cache).
  -KeepOllama  With 'down': remove data volumes but keep ollama_data (model cache).
  -Follow      With 'logs': follow output (-f).
  -Service     One or more compose service names (repeatable).

Examples:
  .\scripts\run.ps1
  .\scripts\run.ps1 up -Detach -Build
  .\scripts\run.ps1 up -Infra -Detach
  .\scripts\run.ps1 up -NoOllama -Detach
  .\scripts\run.ps1 dev
  .\scripts\run.ps1 logs -Service backend -Follow
  .\scripts\run.ps1 down -Volumes
  .\scripts\run.ps1 down -KeepOllama
  .\scripts\run.ps1 restart frontend -Build
  .\scripts\run.ps1 restart -Detach -Build
  .\scripts\run.ps1 -Service backend -Service celery-routing up -Detach

URLs (full stack):
  Frontend        http://localhost:3000
  API / Swagger   http://localhost:8000/docs
  Keycloak        http://localhost:8080
  Orthanc On-Prem http://localhost:8042
  Orthanc Cloud   http://localhost:8043
  Ollama          http://localhost:11434

Default login: admin / admin123
'@
}

function Show-Urls {
    param([string]$Mode = "full")
    Write-Host ""
    Write-Ok ('Services started ({0} mode).' -f $Mode)
    if ($Mode -eq "dev") {
        Write-Host "  Frontend (local)  http://localhost:5173  (npm run dev)"
    } else {
        Write-Host "  Frontend          http://localhost:3000"
    }
    Write-Host "  API / Swagger     http://localhost:8000/docs"
    Write-Host "  Keycloak          http://localhost:8080"
    Write-Host "  Orthanc On-Prem   http://localhost:8042"
    Write-Host "  Orthanc Cloud     http://localhost:8043"
    if (-not $NoOllama -and -not $Infra) {
        Write-Host "  Ollama            http://localhost:11434"
    }
    Write-Host "  Login             admin / admin123"
    Write-Host ""
}

function Invoke-HealthCheck {
    $url = "http://localhost:8000/api/v1/health"
    Write-Info "GET $url"
    try {
        $response = Invoke-RestMethod -Uri $url -TimeoutSec 10
        $response | ConvertTo-Json -Depth 6
    } catch {
        Write-Err "Health check failed. Is the backend running?"
        throw
    }
}

function Start-FrontendDev {
    $frontendDir = Join-Path $Root "frontend"
    if (-not (Test-Path (Join-Path $frontendDir "package.json"))) {
        throw "frontend/package.json not found."
    }
    if (-not (Test-Path (Join-Path $frontendDir "node_modules"))) {
        Write-Info "Installing frontend dependencies…"
        Push-Location $frontendDir
        try {
            if (Get-Command npm -ErrorAction SilentlyContinue) {
                npm install
            } else {
                throw "npm is not on PATH. Install Node.js or run the frontend container instead."
            }
        } finally {
            Pop-Location
        }
    }
    Write-Info "Starting Vite dev server (Ctrl+C to stop)…"
    Push-Location $frontendDir
    try {
        npm run dev
    } finally {
        Pop-Location
    }
}

Test-Docker

switch ($Command) {
    "help" {
        Show-Help
        exit 0
    }

    "env" {
        Ensure-EnvFile
        Write-Ok ".env is ready at $(Join-Path $Root '.env')"
        exit 0
    }

    "health" {
        Invoke-HealthCheck
        exit 0
    }

    "ps" {
        docker compose ps
        exit $LASTEXITCODE
    }

    "build" {
        Ensure-EnvFile
        $targets = @(Get-TargetServices)
        Write-Info "Building: $($targets -join ', ')"
        docker compose build @targets
        exit $LASTEXITCODE
    }

    "logs" {
        $composeArgs = @("compose", "logs")
        if ($Follow) { $composeArgs += "-f" }
        if ($Service -and $Service.Count -gt 0) {
            $composeArgs += @($Service)
        }
        docker @composeArgs
        exit $LASTEXITCODE
    }

    "down" {
        Invoke-ComposeDown
        exit $LASTEXITCODE
    }

    "restart" {
        $targets = @(Get-TargetServices)

        if ($Service -and $Service.Count -gt 0) {
            Ensure-EnvFile
            if ($Build) {
                Write-Info "Recreating with rebuild: $($targets -join ', ')"
                $composeArgs = @("compose", "up", "-d", "--build", "--force-recreate") + @($targets)
                docker @composeArgs
            } else {
                Write-Info "Restarting: $($targets -join ', ')"
                docker compose restart @targets
            }
            exit $LASTEXITCODE
        }

        $downParams = @{ Command = "down" }
        if ($Volumes) { $downParams.Volumes = $true }
        if ($KeepOllama) { $downParams.KeepOllama = $true }
        & $PSCommandPath @downParams
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

        $upParams = @{ Command = "up" }
        if ($Build) { $upParams.Build = $true }
        if ($Detach) { $upParams.Detach = $true }
        if ($Infra) { $upParams.Infra = $true }
        if ($NoOllama) { $upParams.NoOllama = $true }
        & $PSCommandPath @upParams
        exit $LASTEXITCODE
    }

    "dev" {
        Ensure-EnvFile
        $targets = @(Get-TargetServices)
        if ($targets -contains "frontend") {
            $targets = @($targets | Where-Object { $_ -ne "frontend" })
        }
        if ($targets.Count -eq 0) {
            $targets = @($InfraServices + $AppServices | Where-Object { $_ -ne "frontend" })
            if (-not $NoOllama) { $targets += $OllamaService }
        }

        $composeArgs = @("compose", "up")
        if ($Build) { $composeArgs += "--build" }
        $composeArgs += "-d"
        $composeArgs += @($targets)

        Write-Info "Starting backend stack in Docker (no frontend container)…"
        docker @composeArgs
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

        Show-Urls -Mode "dev"
        Start-FrontendDev
        exit $LASTEXITCODE
    }

    "up" {
        Ensure-EnvFile
        $targets = @(Get-TargetServices)
        $composeArgs = @("compose", "up")
        if ($Build) { $composeArgs += "--build" }
        if ($Detach) { $composeArgs += "-d" }
        $composeArgs += @($targets)

        $mode = if ($Infra) { "infra" } elseif ($NoOllama) { "no-ollama" } else { "full" }
        Write-Info "Starting ($mode): $($targets -join ', ')"
        docker @composeArgs
        $code = $LASTEXITCODE
        if ($code -eq 0 -and $Detach) {
            Show-Urls -Mode $(if ($Infra) { "infra" } else { "full" })
        }
        exit $code
    }

    default {
        Show-Help
        exit 1
    }
}
