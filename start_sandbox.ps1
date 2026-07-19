# Double-click entry point for soemdsp-sandbox-clap: starts both local
# processes this UI depends on (the sandbox web server, and the CLAP
# plugin host companion process -- see docs/WEBUI_CLAP_HOST_PLAN.md for
# why hosting a native CLAP plugin can never happen inside the browser
# itself) and opens the sandbox once both are actually listening.
#
# Idempotent: if a process is already bound to its port (e.g. you double-
# clicked this twice, or started one half manually), this skips relaunching
# it rather than erroring or spawning a duplicate.

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$SandboxHost = "127.0.0.1"
$SandboxPort = 8765
$ClapHostPort = 47991
$ReadyTimeoutSeconds = 25

function Test-PortOpen([string]$TargetHost, [int]$Port) {
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $async = $client.BeginConnect($TargetHost, $Port, $null, $null)
        $connected = $async.AsyncWaitHandle.WaitOne(300)
        if ($connected -and $client.Connected) {
            $client.EndConnect($async)
            $client.Close()
            return $true
        }
        $client.Close()
        return $false
    } catch {
        return $false
    }
}

function Wait-ForPort([string]$Label, [string]$TargetHost, [int]$Port, [int]$TimeoutSeconds) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-PortOpen -TargetHost $TargetHost -Port $Port) {
            Write-Host "$Label is up (${TargetHost}:$Port)."
            return $true
        }
        Start-Sleep -Milliseconds 300
    }
    Write-Warning "$Label did not come up on ${TargetHost}:$Port within $TimeoutSeconds seconds."
    return $false
}

Push-Location $RepoRoot
try {
    if (Test-PortOpen -TargetHost $SandboxHost -Port $ClapHostPort) {
        Write-Host "CLAP plugin host already running on port $ClapHostPort -- not starting another copy."
    } else {
        Write-Host "Starting local CLAP plugin host (port $ClapHostPort)..."
        Start-Process -FilePath "powershell" -ArgumentList @(
            "-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass",
            "-File", (Join-Path $RepoRoot "tools\webui-clap-host\start_webui_clap_host.ps1"),
            "-Port", $ClapHostPort
        ) -WindowStyle Normal
    }

    if (Test-PortOpen -TargetHost $SandboxHost -Port $SandboxPort) {
        Write-Host "Sandbox server already running on port $SandboxPort -- not starting another copy."
    } else {
        Write-Host "Starting sandbox server (port $SandboxPort)..."
        Start-Process -FilePath "powershell" -ArgumentList @(
            "-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass",
            "-Command", "python server.py --host $SandboxHost --port $SandboxPort"
        ) -WorkingDirectory $RepoRoot -WindowStyle Normal
    }

    $clapReady = Wait-ForPort -Label "CLAP plugin host" -TargetHost $SandboxHost -Port $ClapHostPort -TimeoutSeconds $ReadyTimeoutSeconds
    $sandboxReady = Wait-ForPort -Label "Sandbox server" -TargetHost $SandboxHost -Port $SandboxPort -TimeoutSeconds $ReadyTimeoutSeconds

    if (-not $sandboxReady) {
        Write-Warning "Sandbox server never came up -- check its console window for errors."
        return
    }
    if (-not $clapReady) {
        Write-Warning "CLAP plugin host never came up -- the sandbox will still open, but CLAP Plugin modules will show 'Not Running' until it's started (check its console window for errors)."
    }

    Start-Process "http://${SandboxHost}:${SandboxPort}/"
} finally {
    Pop-Location
}
