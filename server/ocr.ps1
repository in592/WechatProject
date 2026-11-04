param(
  [Parameter(Mandatory = $true)][string]$Path,
  [Parameter(Mandatory = $true)][string]$OutPath
)

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

function Await($WinRtTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}

function Test-BlockPixel($color) {
  $max = [Math]::Max([int]$color.R, [Math]::Max([int]$color.G, [int]$color.B))
  $min = [Math]::Min([int]$color.R, [Math]::Min([int]$color.G, [int]$color.B))
  return (($max - $min) -ge 18) -and ($max -le 252)
}

function Write-Result($payload) {
  $json = $payload | ConvertTo-Json -Compress -Depth 4
  [System.IO.File]::WriteAllText($OutPath, $json, (New-Object System.Text.UTF8Encoding($false)))
}

try {
  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($Path)) ([Windows.Storage.StorageFile])
  $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])

  $language = [Windows.Globalization.Language]::new('zh-Hans-CN')
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)
  if (-not $engine) {
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
  }

  if (-not $engine) {
    Write-Result @{ ok = $false; error = '没有可用的 Windows OCR 引擎' }
    exit 0
  }

  $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  $lines = @()
  foreach ($line in $result.Lines) {
    $lineText = $line.Text
    $minX = [double]::MaxValue
    $minY = [double]::MaxValue
    $maxX = 0.0
    $maxY = 0.0
    $hasBox = $false

    foreach ($word in $line.Words) {
      $rect = $word.BoundingRect
      $hasBox = $true
      if ($rect.X -lt $minX) { $minX = $rect.X }
      if ($rect.Y -lt $minY) { $minY = $rect.Y }
      if (($rect.X + $rect.Width) -gt $maxX) { $maxX = $rect.X + $rect.Width }
      if (($rect.Y + $rect.Height) -gt $maxY) { $maxY = $rect.Y + $rect.Height }
    }

    if ($lineText -and $hasBox) {
      $lines += [pscustomobject]@{
        text = $lineText
        x = [int][Math]::Round($minX)
        y = [int][Math]::Round($minY)
        w = [int][Math]::Round($maxX - $minX)
        h = [int][Math]::Round($maxY - $minY)
        blockTop = 0
        blockBottom = 0
      }
    }
  }

  Add-Type -AssemblyName System.Drawing
  $drawing = New-Object System.Drawing.Bitmap($Path)
  $sampleXs = @()
  for ($i = 1; $i -le 13; $i++) {
    $sampleXs += [int]($drawing.Width * $i / 14)
  }

  $lineYs = New-Object System.Collections.Generic.List[int]
  for ($y = 0; $y -lt $drawing.Height; $y++) {
    $grayHits = 0
    $redHits = 0
    foreach ($x in $sampleXs) {
      $color = $drawing.GetPixel($x, $y)
      $r = [int]$color.R
      $g = [int]$color.G
      $b = [int]$color.B
      $max = [Math]::Max($r, [Math]::Max($g, $b))
      $min = [Math]::Min($r, [Math]::Min($g, $b))

      if ((($max - $min) -lt 16) -and ($max -ge 190) -and ($max -le 225)) {
        $grayHits++
      }
      if (($r - $g -gt 35) -and ($r - $b -gt 35)) {
        $redHits++
      }
    }
    if (($grayHits -ge 5) -or ($redHits -ge 5)) { $lineYs.Add($y) }
  }
  $rowLines = @()
  foreach ($y in $lineYs) {
    if ($rowLines.Count -eq 0) {
      $rowLines += [int]$y
      continue
    }
    if (($y - $rowLines[$rowLines.Count - 1]) -le 2) { continue }
    $rowLines += [int]$y
  }

  if ($rowLines.Count -ge 2) {
    $gridTop = [int]$rowLines[0]
    $gridBottom = [int]$rowLines[$rowLines.Count - 1]
    $bmpWidth = $drawing.Width
    $bmpHeight = $drawing.Height

    foreach ($line in $lines) {
      $yCenter = [int]($line.y + $line.h / 2)
      if ($yCenter -lt $gridTop -or $yCenter -gt $gridBottom) { continue }

      $xStart = [Math]::Max(0, [int]$line.x)
      $xEnd = [Math]::Min($bmpWidth - 1, [int]($line.x + $line.w))
      $minTop = $yCenter
      $maxBottom = $yCenter
      $found = $false

      for ($x = $xStart; $x -le $xEnd; $x += 2) {
        if (-not (Test-BlockPixel $drawing.GetPixel($x, $yCenter))) { continue }

        $top = $yCenter
        $bottom = $yCenter
        while ($top -gt $gridTop -and (Test-BlockPixel $drawing.GetPixel($x, $top - 1))) { $top-- }
        while ($bottom -lt $gridBottom -and (Test-BlockPixel $drawing.GetPixel($x, $bottom + 1))) { $bottom++ }

        if ($bottom -gt $top) {
          if (-not $found -or $top -lt $minTop) { $minTop = $top }
          if (-not $found -or $bottom -gt $maxBottom) { $maxBottom = $bottom }
          $found = $true
        }
      }

      if ($found) {
        $line.blockTop = [int]$minTop
        $line.blockBottom = [int]$maxBottom
      }
    }
  }

  $drawing.Dispose()

  Write-Result @{
    ok = $true
    width = [int]$decoder.PixelWidth
    height = [int]$decoder.PixelHeight
    lines = $lines
    rowLines = $rowLines
  }} catch {
  Write-Result @{ ok = $false; error = $_.Exception.Message }
}
