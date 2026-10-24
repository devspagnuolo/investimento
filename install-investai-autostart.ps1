param(
    [switch]$Remove
)

$ErrorActionPreference = 'Stop'
$taskName = 'InvestAI XP MT5 Local'
$projectRoot = $PSScriptRoot
$runner = Join-Path $projectRoot 'run-investai-supervisor.ps1'

if ($Remove) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host 'Inicialização automática removida. Processos já iniciados precisam ser encerrados separadamente.'
    exit 0
}

foreach ($required in @('.env', 'run-investai-supervisor.ps1', 'connectors\mt5_bridge.py', 'server.mjs')) {
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot $required))) {
        throw "Arquivo necessário ausente: $required. Extraia o ZIP e execute setup-windows.ps1 antes."
    }
}
$envContent = Get-Content -LiteralPath (Join-Path $projectRoot '.env')
if ($envContent -notcontains 'INVESTAI_LIVE_TRADING_ENABLED=0') {
    throw 'Instalação recusada: o arquivo .env não declara INVESTAI_LIVE_TRADING_ENABLED=0. Reverta para 0 antes de configurar a inicialização.'
}
if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) { throw 'Instale Node.js 22.9 ou superior.' }
if (-not (Get-Command py.exe -ErrorAction SilentlyContinue)) { throw 'Instale Python 3 para Windows.' }

$accountLine = $envContent | Where-Object { $_ -match '^INVESTAI_MT5_ACCOUNT=\d{4,20}$' } | Select-Object -First 1
if (-not $accountLine) { throw 'O .env não contém um login numérico de conta MT5 válido.' }
if (-not (Get-Process -Name terminal64 -ErrorAction SilentlyContinue)) {
    throw 'Abra o MetaTrader 5, conecte à XP e execute este instalador novamente.'
}

$powerShell = (Get-Command powershell.exe -ErrorAction Stop).Source
$arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $runner + '"'
$action = New-ScheduledTaskAction -Execute $powerShell -Argument $arguments
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$task = New-ScheduledTask -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Inicia e monitora a ponte local XP/MT5 e o servidor InvestAI durante a sessão do usuário. Nunca ativa envio real.'
Register-ScheduledTask -TaskName $taskName -InputObject $task -Force | Out-Null

Write-Host "Inicialização automática instalada para a sessão do usuário: $taskName"
Write-Host 'O supervisor espera o MT5 conectado à XP e reinicia a ponte/servidor se encerrarem.'
Write-Host "Painel local: use a porta definida em .env, normalmente http://127.0.0.1:4173/automation"
Write-Host 'O motor inicia desativado após cada reinício; a tarefa não habilita Algo Trading nem envio real.'
Write-Host 'Logs: %LOCALAPPDATA%\InvestAI\logs'
Write-Host 'Para remover: powershell -ExecutionPolicy Bypass -File .\install-investai-autostart.ps1 -Remove'