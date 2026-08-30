Add-Type -AssemblyName System.Drawing

function New-DukaLogoBitmap {
  param([int]$Size)

  $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  $scale = $Size / 200.0
  function P($x, $y) { return New-Object System.Drawing.PointF(($x * $scale), ($y * $scale)) }

  # Rounded-square badge with an emerald diagonal gradient (matches the app's
  # existing bg-gradient-to-br from-emerald-400 to-emerald-600 badge language).
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

  # Sack silhouette — six cubic beziers matching the Logo.tsx SVG path exactly.
  $sackPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $pts = @(
    @(100,48), @(87,48), @(82,57), @(82,68),
    @(58,77), @(42,102), @(42,133),
    @(42,164), @(67,183), @(100,183),
    @(133,183), @(158,164), @(158,133),
    @(158,102), @(142,77), @(118,68),
    @(118,57), @(113,48), @(100,48)
  )
  $p0 = P $pts[0][0] $pts[0][1]
  $cur = $p0
  for ($i = 1; $i -lt $pts.Count; $i += 3) {
    $c1 = P $pts[$i][0] $pts[$i][1]
    $c2 = P $pts[$i+1][0] $pts[$i+1][1]
    $end = P $pts[$i+2][0] $pts[$i+2][1]
    $sackPath.AddBezier($cur, $c1, $c2, $end)
    $cur = $end
  }
  $sackPath.CloseFigure()
  $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(247, 255, 255, 255))
  $g.FillPath($whiteBrush, $sackPath)

  # Tie band across the sack's neck.
  $tieColor = [System.Drawing.Color]::FromArgb(255, 4, 120, 87)
  $tieBrush = New-Object System.Drawing.SolidBrush($tieColor)
  $tieX = 76 * $scale
  $tieY = 64 * $scale
  $tieW = 48 * $scale
  $tieH = 11 * $scale
  $tieR = 5.5 * $scale
  $tiePath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $td = $tieR * 2
  $tiePath.AddArc($tieX, $tieY, $td, $td, 180, 90)
  $tiePath.AddArc($tieX + $tieW - $td, $tieY, $td, $td, 270, 90)
  $tiePath.AddArc($tieX + $tieW - $td, $tieY + $tieH - $td, $td, $td, 0, 90)
  $tiePath.AddArc($tieX, $tieY + $tieH - $td, $td, $td, 90, 90)
  $tiePath.CloseFigure()
  $g.FillPath($tieBrush, $tiePath)

  # Three spilled grain dots at the base.
  $dots = @(@(72,188,6), @(100,192,7), @(128,188,6))
  foreach ($dot in $dots) {
    $cx = $dot[0] * $scale
    $cy = $dot[1] * $scale
    $r = $dot[2] * $scale
    $g.FillEllipse($tieBrush, ($cx - $r), ($cy - $r), ($r * 2), ($r * 2))
  }

  $g.Dispose()
  return $bmp
}

$sizes = @(16, 32, 48, 64, 128, 256, 512)
$outDir = Join-Path $PSScriptRoot 'sizes'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

foreach ($size in $sizes) {
  $bmp = New-DukaLogoBitmap -Size $size
  $path = Join-Path $outDir "icon-$size.png"
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output "Wrote $path"
}

# Also save the 512px version as the canonical PNG icon.
Copy-Item (Join-Path $outDir 'icon-512.png') (Join-Path $PSScriptRoot 'icon.png') -Force
Write-Output "Wrote $(Join-Path $PSScriptRoot 'icon.png')"
