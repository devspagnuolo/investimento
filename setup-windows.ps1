$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
Set-Location -LiteralPath $projectRoot

foreach ($required in @('server.mjs', 'connectors\mt5_bridge.py', 'package.json')) {
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot $required))) {
        throw "Arquivo necessário não encontrado: $required. Extraia o ZIP completo do InvestAI."
    }
}

$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) { throw 'Instale Node.js 22.9 ou superior e execute este script novamente.' }
$nodeVersion = (& $node.Source --version | Out-String).Trim()
if ($nodeVersion -notmatch '^v?(\d+)\.(\d+)') { throw "Não foi possível interpretar a versão do Node.js: $nodeVersion" }
$nodeMajor = [int]$Matches[1]
$nodeMinor = [int]$Matches[2]
if ($nodeMajor -lt 22 -or ($nodeMajor -eq 22 -and $nodeMinor -lt 9)) {
    throw "Node.js 22.9 ou superior é necessário. Detectado: $nodeVersion"
}

$python = Get-Command py.exe -ErrorAction SilentlyContinue
if (-not $python) { throw 'Instale Python 3 para Windows, marcando a opção de adicionar o launcher py, e execute novamente.' }
& $python.Source -3 --version
if ($LASTEXITCODE -ne 0) { throw 'O launcher py não encontrou uma instalação Python 3.' }

if (-not (Get-Process -Name terminal64 -ErrorAction SilentlyContinue)) {
    throw 'Abra o MetaTrader 5, conecte à conta XP e rode este script novamente.'
}
if (Test-Path -LiteralPath (Join-Path $projectRoot '.env')) {
    throw 'Já existe um .env. O script não sobrescreve a configuração local; revise-a manualmente.'
}

$mt5Package = & $python.Source -3 -m pip show MetaTrader5 2>$null
if ($LASTEXITCODE -ne 0) {
    $answer = Read-Host 'A ponte precisa do pacote Python gratuito MetaTrader5. Instalar agora via pip? [S/n]'
    if ($answer -and $answer -notmatch '^(s|sim)$') { throw 'Instalação cancelada pelo usuário.' }
    & $python.Source -3 -m pip install --user MetaTrader5
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar MetaTrader5. Consulte a saída do pip e tente novamente.' }
}

function Find-FreeLoopbackPort([int]$StartAt, [int[]]$Exclude = @()) {
    for ($port = $StartAt; $port -lt ($StartAt + 100); $port++) {
        if ($Exclude -contains $port) { continue }
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
        try {
            $listener.Start()
            return $port
        } catch {
            continue
        } finally {
            $listener.Stop()
        }
    }
    throw "Não foi encontrada porta local livre a partir de $StartAt."
}

$serverPort = Find-FreeLoopbackPort 4173
$bridgePort = Find-FreeLoopbackPort 4174 @($serverPort)
$account = Read-Host 'Digite o login numérico da conta MT5 mostrado no título do terminal'
if ($account -notmatch '^\d{4,20}$') { throw 'O login da conta deve conter apenas números.' }

$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 32
$rng.GetBytes($bytes)
$rng.Dispose()
$token = [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()

$envContent = @"
PORT=$serverPort
INVESTAI_BROKER=mt5
INVESTAI_LIVE_TRADING_ENABLED=0
INVESTAI_MT5_ACCOUNT=$account
INVESTAI_BRIDGE_TOKEN=$token
INVESTAI_BRIDGE_URL=http://127.0.0.1:$bridgePort
INVESTAI_BRIDGE_PORT=$bridgePort
INVESTAI_MT5_CUSTODY_CONFIRMED=0
INVESTAI_MT5_SERVER_UTC_OFFSET=-3
INVESTAI_SESSION=10:10-16:50
"@
Set-Content -LiteralPath (Join-Path $projectRoot '.env') -Value $envContent -Encoding ASCII

$bridgeProcess = $null
try {
    $bridgeProcess = Start-Process -FilePath $python.Source -ArgumentList @('-3', 'connectors\mt5_bridge.py') -WorkingDirectory $projectRoot -PassThru
    $headers = @{ Authorization = "Bearer $token" }
    $health = $null
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Milliseconds 500
        try { $health = Invoke-RestMethod -Uri "http://127.0.0.1:$bridgePort/health" -Headers $headers -TimeoutSec 2; break } catch {}
    }
    if (-not $health -or -not $health.connected) { throw 'A ponte iniciou, mas não confirmou conexão do terminal. Confira a janela Python e o login do MT5.' }
    if ([string]$health.login -ne $account) { throw 'O login conectado no terminal difere do número informado. O servidor do InvestAI não foi iniciado.' }
    if ($health.currency -ne 'BRL') { throw 'A conta conectada não está em BRL. O servidor do InvestAI não foi iniciado.' }
    if ($health.server -notmatch 'XP|XPMT5') { throw 'O servidor do terminal não parece ser o servidor XP. O servidor do InvestAI não foi iniciado.' }

    $nodeProcess = Start-Process -FilePath $node.Source -ArgumentList @('--env-file-if-exists=.env', 'server.mjs') -WorkingDirectory $projectRoot -PassThru
    Start-Sleep -Seconds 2
    $status = Invoke-RestMethod -Uri "http://127.0.0.1:$serverPort/api/automation" -TimeoutSec 5
    Write-Host ''
    Write-Host 'InvestAI iniciado em modo seguro.'
    Write-Host "Painel: http://127.0.0.1:$serverPort/automation"
    Write-Host "Terminal XP validado: $($health.server), moeda BRL."
    Write-Host "Algo Trading habilitado: $($health.tradeAllowed)"
    Write-Host "Estado do motor: $($status.brokerStatus)"
    Write-Host 'Envio real permanece DESLIGADO. A ponte e o servidor abriram em janelas separadas.'
    Write-Host 'Mantenha o MT5 e as duas janelas do InvestAI abertos.'
} catch {
    if ($bridgeProcess -and -not $bridgeProcess.HasExited) { Stop-Process -Id $bridgeProcess.Id -ErrorAction SilentlyContinue }
    throw
}
