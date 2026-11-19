# FloodReady Native Windows Server (PowerShell)
# Requires no Node.js or external installations. Uses built-in .NET TcpListener.
# Keeps GEMINI_API_KEY secure on the server: never exposed to browser or printed to console.

$port = 3000
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$publicDir = Join-Path $scriptDir "public"

function Get-GeminiApiKey {
    $envFiles = @(".env.local", ".env")
    foreach ($file in $envFiles) {
        $p = Join-Path $scriptDir $file
        if (Test-Path $p) {
            $lines = Get-Content $p
            foreach ($line in $lines) {
                $trimmed = $line.Trim()
                if ($trimmed -and -not $trimmed.StartsWith("#")) {
                    $parts = $trimmed -split "=", 2
                    if ($parts.Length -eq 2) {
                        $k = $parts[0].Trim()
                        $v = $parts[1].Trim().Trim('"').Trim("'")
                        if ($k -eq "GEMINI_API_KEY" -and $v) {
                            return $v
                        }
                    }
                }
            }
        }
    }
    if ($env:GEMINI_API_KEY) { return $env:GEMINI_API_KEY }
    return ""
}

function Get-MimeType($path) {
    $ext = [System.IO.Path]::GetExtension($path).ToLower()
    switch ($ext) {
        ".html" { return "text/html; charset=utf-8" }
        ".css"  { return "text/css; charset=utf-8" }
        ".js"   { return "application/javascript; charset=utf-8" }
        ".json" { return "application/json; charset=utf-8" }
        ".png"  { return "image/png" }
        ".jpg"  { return "image/jpeg" }
        ".svg"  { return "image/svg+xml" }
        default { return "application/octet-stream" }
    }
}

function Invoke-GeminiApi($apiKey, $situation) {
    $model = "gemini-3-flash-preview"
    $url = "https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=$apiKey"
    
    $prompt = @"
You are the FloodReady emergency situational assistant.
Your goal is to help an individual facing a flood situation structure their thoughts, identify missing critical details, and consider suggested next steps.

CRITICAL RULES:
1. Provide a calm, plain-language summary of what is happening based on the description.
2. Identify critical details that are missing (e.g. precise cross streets, water rise rate, presence of elderly/children/pets, power status, drinking water, safe upper floor/roof access).
3. Provide a short list of suggested next steps.
4. Clearly label AI suggestions as suggestions: Each item in suggestedNextSteps MUST start with "[Suggestion]" and be phrased as an unverified suggestion.
5. DO NOT invent or provide emergency phone numbers, hotlines, or official radio frequencies. Instruct the user to consult verified local authorities and official local emergency services.
6. DO NOT claim that information is verified. Always maintain that AI advice is unverified.

User flood situation:
\"\"\"$situation\"\"\"

Return strictly valid JSON adhering to this schema:
{
  "summary": "Plain-language summary of the situation",
  "missingDetails": [
    "Detail 1 that emergency responders would need",
    "Detail 2 that emergency responders would need"
  ],
  "suggestedNextSteps": [
    "[Suggestion] Step 1",
    "[Suggestion] Step 2"
  ]
}
"@

    $bodyObj = @{
        contents = @(
            @{
                parts = @(
                    @{ text = $prompt }
                )
            }
        )
        generationConfig = @{
            temperature = 0.2
            responseMimeType = "application/json"
        }
    }

    $jsonBody = $bodyObj | ConvertTo-Json -Depth 10
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12

    $response = Invoke-RestMethod -Uri $url -Method Post -Body $jsonBody -ContentType "application/json; charset=utf-8"
    $candidateText = $response.candidates[0].content.parts[0].text
    $cleanJson = $candidateText.Trim()
    if ($cleanJson.StartsWith('```json')) {
        $cleanJson = $cleanJson -replace '^```json\s*', '' -replace '```\s*$', ''
    } elseif ($cleanJson.StartsWith('```')) {
        $cleanJson = $cleanJson -replace '^```\s*', '' -replace '```\s*$', ''
    }
    return $cleanJson.Trim()
}

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Parse("127.0.0.1"), $port)
try {
    $listener.Start()
    Write-Host "===============================================" -ForegroundColor Cyan
    Write-Host " FloodReady Server running at http://localhost:$port" -ForegroundColor Green
    $keyPresent = [bool](Get-GeminiApiKey)
    if ($keyPresent) {
        Write-Host " GEMINI_API_KEY status: Configured" -ForegroundColor Green
    } else {
        Write-Host " GEMINI_API_KEY status: Missing in .env.local" -ForegroundColor Yellow
    }
    Write-Host " Security: API key is isolated on server" -ForegroundColor Cyan
    Write-Host " Press Ctrl+C in this terminal to stop the server" -ForegroundColor Gray
    Write-Host "===============================================" -ForegroundColor Cyan

    while ($true) {
        $client = $listener.AcceptTcpClient()
        $stream = $client.GetStream()
        $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)
        $writer = New-Object System.IO.BinaryWriter($stream)

        $requestLine = $reader.ReadLine()
        if (-not $requestLine) {
            $client.Close()
            continue
        }

        $parts = $requestLine -split " "
        $method = $parts[0]
        $path = $parts[1]

        $contentLength = 0
        while ($true) {
            $headerLine = $reader.ReadLine()
            if (-not $headerLine -or $headerLine.Length -eq 0) { break }
            if ($headerLine -match "^Content-Length:\s*(\d+)") {
                $contentLength = [int]$matches[1]
            }
        }

        $body = ""
        if ($contentLength -gt 0) {
            $charBuffer = New-Object char[] $contentLength
            $readCount = 0
            while ($readCount -lt $contentLength) {
                $read = $reader.Read($charBuffer, $readCount, $contentLength - $readCount)
                if ($read -le 0) { break }
                $readCount += $read
            }
            $body = New-Object string ($charBuffer, 0, $readCount)
        }

        $cleanPath = $path.Split('?')[0]

        if ($cleanPath -eq "/api/status" -and $method -eq "GET") {
            $key = Get-GeminiApiKey
            $hasKey = ($key -and $key.Trim().Length -gt 0)
            $resJson = "{`"status`":`"ok`",`"hasKey`":$($hasKey.ToString().ToLower())}"
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($resJson)
            $header = "HTTP/1.1 200 OK`r`nContent-Type: application/json; charset=utf-8`r`nContent-Length: $($bytes.Length)`r`nAccess-Control-Allow-Origin: *`r`nConnection: close`r`n`r`n"
            $writer.Write([System.Text.Encoding]::ASCII.GetBytes($header))
            $writer.Write($bytes)
        }
        elseif ($cleanPath -eq "/api/analyze" -and $method -eq "POST") {
            $key = Get-GeminiApiKey
            if (-not $key) {
                $resJson = "{`"error`":`"GEMINI_API_KEY is not configured. Please add your key to .env.local on line 3.`"}"
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($resJson)
                $header = "HTTP/1.1 400 Bad Request`r`nContent-Type: application/json; charset=utf-8`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n"
                $writer.Write([System.Text.Encoding]::ASCII.GetBytes($header))
                $writer.Write($bytes)
            } else {
                try {
                    $parsed = $body | ConvertFrom-Json
                    $desc = $parsed.description
                    if (-not $desc -or -not $desc.Trim()) {
                        $resJson = "{`"error`":`"Please provide a flood situation description.`"}"
                        $bytes = [System.Text.Encoding]::UTF8.GetBytes($resJson)
                        $header = "HTTP/1.1 400 Bad Request`r`nContent-Type: application/json; charset=utf-8`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n"
                        $writer.Write([System.Text.Encoding]::ASCII.GetBytes($header))
                        $writer.Write($bytes)
                    } else {
                        $geminiResult = Invoke-GeminiApi -apiKey $key -situation $desc
                        $bytes = [System.Text.Encoding]::UTF8.GetBytes($geminiResult)
                        $header = "HTTP/1.1 200 OK`r`nContent-Type: application/json; charset=utf-8`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n"
                        $writer.Write([System.Text.Encoding]::ASCII.GetBytes($header))
                        $writer.Write($bytes)
                    }
                } catch {
                    $errText = $_.Exception.Message
                    if ($_.Exception.Response) {
                        try {
                            $stream = $_.Exception.Response.GetResponseStream()
                            if ($stream) {
                                $reader = New-Object System.IO.StreamReader($stream)
                                $respBody = $reader.ReadToEnd()
                                $parsedErr = $respBody | ConvertFrom-Json
                                if ($parsedErr.error.message) {
                                    $errText = $parsedErr.error.message
                                }
                            }
                        } catch {}
                    }
                    $errText = $errText -replace '"', '\"'
                    $resJson = "{`"error`":`"Error calling Gemini: $errText`"}"
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes($resJson)
                    $header = "HTTP/1.1 500 Internal Server Error`r`nContent-Type: application/json; charset=utf-8`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n"
                    $writer.Write([System.Text.Encoding]::ASCII.GetBytes($header))
                    $writer.Write($bytes)
                }
            }
        }
        elseif ($method -eq "GET") {
            $reqFile = if ($cleanPath -eq "/") { "index.html" } else { $cleanPath.TrimStart('/') }
            $safeFile = [System.IO.Path]::GetFullPath((Join-Path $publicDir $reqFile))
            if ($safeFile.StartsWith($publicDir) -and (Test-Path $safeFile -PathType Leaf)) {
                $fileBytes = [System.IO.File]::ReadAllBytes($safeFile)
                $mime = Get-MimeType $safeFile
                $header = "HTTP/1.1 200 OK`r`nContent-Type: $mime`r`nContent-Length: $($fileBytes.Length)`r`nConnection: close`r`n`r`n"
                $writer.Write([System.Text.Encoding]::ASCII.GetBytes($header))
                $writer.Write($fileBytes)
            } else {
                $notFound = [System.Text.Encoding]::UTF8.GetBytes("Not Found")
                $header = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain`r`nContent-Length: $($notFound.Length)`r`nConnection: close`r`n`r`n"
                $writer.Write([System.Text.Encoding]::ASCII.GetBytes($header))
                $writer.Write($notFound)
            }
        }
        else {
            $notAllowed = [System.Text.Encoding]::UTF8.GetBytes("Method Not Allowed")
            $header = "HTTP/1.1 405 Method Not Allowed`r`nContent-Type: text/plain`r`nContent-Length: $($notAllowed.Length)`r`nConnection: close`r`n`r`n"
            $writer.Write([System.Text.Encoding]::ASCII.GetBytes($header))
            $writer.Write($notAllowed)
        }

        $writer.Flush()
        $client.Close()
    }
} finally {
    $listener.Stop()
}
