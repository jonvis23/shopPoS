param(
  [string]$SourcePath = "$PSScriptRoot\cereal-bag-source.jpg"
)

Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $SourcePath)) {
  throw "Source image not found: $SourcePath"
}

$source = [System.Drawing.Bitmap]::FromFile($SourcePath)

# The source is a JPG with a plain white background — SetColorKey makes white
# (and near-white, to swallow JPEG compression fringing) transparent so the
# bag composites cleanly onto the emerald badge instead of sitting in a white box.
$attrs = New-Object System.Drawing.Imaging.ImageAttributes
$attrs.SetColorKey([System.Drawing.Color]::FromArgb(235, 235, 235), [System.Drawing.Color]::FromArgb(255, 255, 255))

function New-BadgeBitmap {
  param([int]$Size)

  $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.Clear([System.Drawing.Color]::Transparent)

  $scale = $Size / 200.0

  # Same rounded-square badge shape/gradient as the current emerald icon.
  $corner = 44 * $scale
  $rectPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $corner * 2
  $rectPath.AddArc(0, 0, $d, $d, 180, 90)
  $rectPath.AddArc($Size - $d, 0, $d, $d, 270, 90)
  $rectPath.AddArc($Size - $d, $Size - $d, $d, $d, 0, 90)
  $rectPath.AddArc(0, $Size - $d, $d, $d, 90, 90)
  $rectPath.CloseFigure()

  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point(0, 0)),
    (New-Object System.Drawing.Point($Size, $Size)),
    [System.Drawing.Color]::FromArgb(255, 52, 211, 153),
    [System.Drawing.Color]::FromArgb(255, 5, 150, 105)
  )
  $g.FillPath($brush, $rectPath)
  $g.SetClip($rectPath)

  # Bag centered with headroom on all sides so it doesn't touch the badge's rounded
  # corners — sized against the source's own aspect ratio, not forced to a square.
  $padding = 30 * $scale
  $availW = $Size - $padding * 2
  $availH = $Size - $padding * 2
  $srcRatio = $source.Width / $source.Height
  if ($availW / $availH -gt $srcRatio) {
    $drawH = $availH
    $drawW = $availH * $srcRatio
  } else {
    $drawW = $availW
    $drawH = $availW / $srcRatio
  }
  $drawX = ($Size - $drawW) / 2
  $drawY = ($Size - $drawH) / 2

  $destRect = New-Object System.Drawing.Rectangle(0, 0, [int]$drawW, [int]$drawH)
  $g.TranslateTransform($drawX, $drawY)
  $g.DrawImage($source, $destRect, 0, 0, $source.Width, $source.Height, [System.Drawing.GraphicsUnit]::Pixel, $attrs)

  $g.Dispose()
  return $bmp
}

$sizes = @(16, 32, 48, 64, 128, 256, 512)
$outDir = Join-Path $PSScriptRoot 'sizes'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

foreach ($size in $sizes) {
  $bmp = New-BadgeBitmap -Size $size
  $path = Join-Path $outDir "icon-$size.png"
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output "Wrote $path"
}

Copy-Item (Join-Path $outDir 'icon-512.png') (Join-Path $PSScriptRoot 'icon.png') -Force
Write-Output "Wrote $(Join-Path $PSScriptRoot 'icon.png')"

$source.Dispose()
