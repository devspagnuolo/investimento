$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$envFile = Join-Path $projectRoot '.env'
$logRoot = Join-Path $env:LOCALAPPDATA 'InvestAI\logs'
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
$logFile = Join-Path $logRoot 'startup-supervisor.log'

function Write-Log([string]$Message) {
    Add-Content -LiteralPath $logFile -Encoding UTF8 -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
}

function Read-ProjectEnv {
    if (-not (Test-Path -LiteralPath $envFile)) { throw 'Arquivo .env não encontrado. Execute setup-windows.ps1 antes de instalar a inicialização automática.' }
    $values = @{}
    foreach ($line in Get-Content -LiteralPath $envFile) {
        if ($line -match '^\s*#' -or $line -notmatch '^\s*([^=]+)=(.*)$') { continue }
        $values[$Matches[1].Trim()] = $Matches[2].Trim().Trim('"')
    }
    return $values
}

function Test-Bridge([hashtable]$Config) {
    try {
        $headers = @{ Authorization = "Bearer $($Config.INVESTAI_BRIDGE_TOKEN)" }
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:$($Config.INVESTAI_BRIDGE_PORT)/health" -Headers $headers -TimeoutSec 3
        return $health.connected -and ([string]$health.login -eq [string]$Config.INVESTAI_MT5_ACCOUNT) -and $health.currency -eq 'BRL' -and $health.server -match 'XP|XPMT5'
    } catch { return $false }
}

function Test-Server([hashtable]$Config) {
    try {
        $status = Invoke-RestMethod -Uri "http://127.0.0.1:$($Config.PORT)/api/automation" -TimeoutSec 3
        return $status.connected -and $status.broker -eq 'XP / MetaTrader 5'
    } catch { return $false }
}

function Start-Bridge([string]$Python) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $stdout = Join-Path $logRoot "bridge-$stamp.log"
    $stderr = Join-Path $logRoot "bridge-error-$stamp.log"
    return Start-Process -FilePath $Python -ArgumentList @('-3', 'connectors\mt5_bridge.py') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
}

function Start-Server([string]$Node) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $stdout = Join-Path $logRoot "server-$stamp.log"
    $stderr = Join-Path $logRoot "server-error-$stamp.log"
    return Start-Process -FilePath $Node -ArgumentList @('--env-file-if-exists=.env', 'server.mjs') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
}

$node = Get-Command node.exe -ErrorAction SilentlyContinue
$python = Get-Command py.exe -ErrorAction SilentlyContinue
if (-not $node) { throw 'Node.js 22.9 ou superior não foi encontrado.' }
if (-not $python) { throw 'O launcher Python py.exe não foi encontrado.' }
$config = Read-ProjectEnv
if (-not $config.INVESTAI_MT5_ACCOUNT -or -not $config.INVESTAI_BRIDGE_TOKEN -or -not $config.INVESTAI_BRIDGE_PORT -or -not $config.PORT) { throw 'Configuração incompleta no .env. Execute setup-windows.ps1.' }

Write-Log 'Supervisor iniciado; envio real não é ativado por este script.'
$bridgeProcess = $null
$serverProcess = $null
$lastWaitMessage = Get-Date '2000-01-01'
while ($true) {
    try {
        if (-not (Get-Process -Name terminal64 -ErrorAction SilentlyContinue)) {
            if ((Get-Date) - $lastWaitMessage -gt [TimeSpan]::FromMinutes(5)) {
                Write-Log 'Aguardando MetaTrader 5 aberto e conectado à XP.'
                $lastWaitMessage = Get-Date
            }
            Start-Sleep -Seconds 15
            continue
        }

        if (-not (Test-Bridge $config)) {
            if ($bridgeProcess -and -not $bridgeProcess.HasExited) {
                Start-Sleep -Seconds 10
            } else {
                try {
                    $bridgeProcess = Start-Bridge $python.Source
                    Write-Log "Ponte iniciada (PID $($bridgeProcess.Id))."
                    Start-Sleep -Seconds 5
                } catch {
                    Write-Log "Falha ao iniciar ponte: $($_.Exception.Message)"
                    Start-Sleep -Seconds 15
                    continue
                }
            }
            if (-not (Test-Bridge $config)) {
                if ($bridgeProcess -and $bridgeProcess.HasExited) { Write-Log "Ponte terminou com código $($bridgeProcess.ExitCode)." }
                Start-Sleep -Seconds 15
                continue
            }
            Write-Log 'Ponte autenticada no terminal XP/BRL esperado.'
        }

        if (-not (Test-Server $config)) {
            if ($serverProcess -and -not $serverProcess.HasExited) {
                Start-Sleep -Seconds 10
            } else {
                try {
                    $serverProcess = Start-Server $node.Source
                    Write-Log "Servidor InvestAI iniciado (PID $($serverProcess.Id))."
                    Start-Sleep -Seconds 5
                } catch {
                    Write-Log "Falha ao iniciar servidor: $($_.Exception.Message)"
                    Start-Sleep -Seconds 15
                    continue
                }
            }
            if (-not (Test-Server $config)) {
                if ($serverProcess -and $serverProcess.HasExited) { Write-Log "Servidor terminou com código $($serverProcess.ExitCode)." }
                Start-Sleep -Seconds 15
                continue
            }
            Write-Log "Automação local disponível em http://127.0.0.1:$($config.PORT)/automation; motor inicia desativado após reinicialização."
        }
    } catch {
        Write-Log "Erro no supervisor: $($_.Exception.Message)"
    }
    Start-Sleep -Seconds 15
}