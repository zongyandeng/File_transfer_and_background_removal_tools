# iDeer Image Tool - Local Lightweight HTTP Server
# Pure PowerShell Implementation for Windows Native Compatibility

$port = 8080
$url = "http://localhost:$port/"
$currentDir = Get-Location

# Initialize HTTP Listener
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($url)

try {
    $listener.Start()
    Write-Host "======================================================================" -ForegroundColor Green
    Write-Host "🚀 iDeer 本地原生 HTTP 伺服器啟動成功！" -ForegroundColor Green
    Write-Host "======================================================================" -ForegroundColor Green
    Write-Host "• 網址: $url" -ForegroundColor Cyan
    Write-Host "• 資料夾路徑: $currentDir" -ForegroundColor Gray
    Write-Host "• 提示: 請勿關閉此視窗，關閉視窗將停止伺服器運行。" -ForegroundColor Yellow
    Write-Host "• 停止伺服器: 請按 Ctrl + C 或直接關閉此終端機。" -ForegroundColor Gray
    Write-Host "----------------------------------------------------------------------"

    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $req = $context.Request
        $res = $context.Response
        
        # Parse local path
        $path = $req.Url.LocalPath
        if ($path -eq "/") {
            $path = "/index.html"
        }
        
        # Combine to get local file path
        # Trim leading slash to avoid absolute path issues on Windows
        $relativeFile = $path.TrimStart('/')
        $filePath = Join-Path $currentDir $relativeFile
        
        if (Test-Path $filePath -PathType Leaf) {
            # Read file bytes
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            
            # Identify MIME Type for browser rendering
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            switch ($ext) {
                ".html" { $res.ContentType = "text/html; charset=utf-8" }
                ".css"  { $res.ContentType = "text/css" }
                ".js"   { $res.ContentType = "application/javascript" }
                ".png"  { $res.ContentType = "image/png" }
                ".jpg"  { $res.ContentType = "image/jpeg" }
                ".jpeg" { $res.ContentType = "image/jpeg" }
                ".webp" { $res.ContentType = "image/webp" }
                ".gif"  { $res.ContentType = "image/gif" }
                ".svg"  { $res.ContentType = "image/svg+xml" }
                ".ico"  { $res.ContentType = "image/x-icon" }
                default { $res.ContentType = "application/octet-stream" }
            }
            
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            # File Not Found
            $res.StatusCode = 404
            $errorMsg = "404 - File Not Found: $path"
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($errorMsg)
            $res.ContentType = "text/plain; charset=utf-8"
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
        }
        
        $res.Close()
    }
} catch {
    Write-Host "伺服器發生錯誤: $_" -ForegroundColor Red
} finally {
    if ($listener.IsListening) {
        $listener.Stop()
    }
}
