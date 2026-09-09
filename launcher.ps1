$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$errorLog = Join-Path $root 'launcher_error.log'
$serverLog = Join-Path $root 'server.log'
$port = 8881

function Test-YakyoPort {
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $async = $client.BeginConnect('127.0.0.1', $port, $null, $null)
        $ok = $async.AsyncWaitHandle.WaitOne(300)
        if ($ok) { $client.EndConnect($async) }
        $client.Close()
        return $ok
    } catch { return $false }
}

try {
    Set-Location $root
    if (Test-YakyoPort) {
        try { $v = Invoke-RestMethod "http://127.0.0.1:$port/api/version" -TimeoutSec 1 } catch { $v = $null }
        if (-not $v -or $v.version -ne '0.30.0') { throw '偵測到舊版離線伺服器仍在執行。請先關閉舊版 Python 視窗後再啟動本版。' }
        Start-Process "http://127.0.0.1:$port/index.html?build=0.30.0"
        Write-Host '偵測到離線伺服器已經啟動，已重新開啟遊戲。' -ForegroundColor Green
        Start-Sleep -Seconds 2
        exit 0
    }

    $python = $null
    $prefix = @()
    $pyLauncher = Get-Command 'py.exe' -ErrorAction SilentlyContinue
    if ($pyLauncher) {
        $python = $pyLauncher.Source
        $prefix = @('-3')
    } else {
        $pythonCmd = Get-Command 'python.exe' -ErrorAction SilentlyContinue
        if ($pythonCmd) { $python = $pythonCmd.Source }
    }
    if (-not $python) {
        throw '找不到 Python。請重新安裝 Python 3，安裝時勾選 Add Python to PATH。'
    }

    Remove-Item $serverLog -ErrorAction SilentlyContinue
    $args = @() + $prefix + @('server.py')
    $proc = Start-Process -FilePath $python -ArgumentList $args -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $serverLog -RedirectStandardError $errorLog -PassThru

    $ready = $false
    for ($i=0; $i -lt 30; $i++) {
        Start-Sleep -Milliseconds 200
        if ($proc.HasExited) { break }
        if (Test-YakyoPort) { $ready = $true; break }
    }
    if (-not $ready) {
        $detail = if (Test-Path $errorLog) { Get-Content $errorLog -Raw } else { '' }
        throw "本機伺服器沒有成功啟動。$detail"
    }

    Start-Process "http://127.0.0.1:$port/index.html?build=0.30.0"
    Write-Host ''
    Write-Host 'YaKyoLife 離線版已成功開啟。' -ForegroundColor Green
    Write-Host '這個黑色視窗可以關閉；遊戲伺服器會繼續在背景執行。'
    Write-Host '若瀏覽器沒有自動開啟，請輸入：http://127.0.0.1:8881/index.html?build=0.30.0'
    Start-Sleep -Seconds 5
    exit 0
} catch {
    $message = $_.Exception.Message
    Set-Content -Path $errorLog -Value ("時間：{0}`r`n錯誤：{1}`r`nPowerShell：{2}`r`n資料夾：{3}" -f (Get-Date),$message,$PSVersionTable.PSVersion,$root) -Encoding UTF8
    Write-Host ''
    Write-Host '啟動失敗：' -ForegroundColor Red
    Write-Host $message -ForegroundColor Yellow
    Write-Host "錯誤紀錄：$errorLog"
    exit 1
}
