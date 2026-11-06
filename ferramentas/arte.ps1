# Converte a foto em uma grade de brilho (0 a 9) recortada no contorno da pessoa e da torre.
# Fora do contorno fica espaco. Saida: arte/arte.json, lido por gerar.mjs.
# Uso (Windows): powershell -File ferramentas/arte.ps1 -Foto foto/paris.jpg [-Colunas 56] [-Mascara saida.png]
param([Parameter(Mandatory)][string]$Foto, [int]$Colunas = 64, [string]$Saida = "$PSScriptRoot\..\arte\arte.json", [string]$Mascara)
Add-Type -AssemblyName System.Drawing

# Recorte da foto original (1350x1800): torre e pessoa
$RX = 460; $RY = 355; $RW = 830; $RH = 1445

$pessoa = @(
  @(962,828),@(1040,820),@(1105,845),@(1132,895),@(1132,960),@(1118,1000),@(1108,1035),
  @(1140,1058),@(1195,1125),@(1250,1175),@(1268,1250),@(1275,1400),@(1272,1600),@(1268,1800),
  @(860,1800),@(862,1700),@(822,1655),@(828,1570),@(848,1420),@(880,1250),@(915,1170),
  @(965,1095),@(948,1062),@(930,1040),@(922,985),@(912,935),@(912,880),@(930,845)
)
$torre = @(
  @(606,372),@(611,372),@(616,440),@(626,520),@(640,640),@(660,780),@(672,840),@(690,930),
  @(705,1000),@(722,1075),@(480,1075),@(500,1010),@(530,930),@(548,840),@(562,780),@(582,640),@(596,520),@(602,440)
)

$original = [System.Drawing.Bitmap]::FromFile((Resolve-Path $Foto))
$contorno = New-Object System.Drawing.Bitmap $original.Width, $original.Height
$gm = [System.Drawing.Graphics]::FromImage($contorno)
$gm.Clear([System.Drawing.Color]::Black)
foreach ($poly in @($pessoa, $torre)) {
  $pts = $poly | ForEach-Object { New-Object System.Drawing.Point $_[0], $_[1] }
  $gm.FillPolygon([System.Drawing.Brushes]::White, [System.Drawing.Point[]]$pts)
}
$gm.Dispose()
if ($Mascara) { $contorno.Save($Mascara) }

$nLinhas = [int][math]::Round($Colunas * ($RH / $RW) * 0.5)
function Reduzir($bmp) {
  $peq = New-Object System.Drawing.Bitmap $Colunas, $nLinhas
  $gr = [System.Drawing.Graphics]::FromImage($peq)
  $gr.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $gr.DrawImage($bmp, (New-Object System.Drawing.Rectangle 0, 0, $Colunas, $nLinhas), (New-Object System.Drawing.Rectangle $RX, $RY, $RW, $RH), [System.Drawing.GraphicsUnit]::Pixel)
  $gr.Dispose(); $peq
}
$reduzida = Reduzir $original
$mascaraPeq = Reduzir $contorno

# brilho so dentro do contorno; depois cada valor vira sua posicao entre os de dentro (equalizacao)
$lum = New-Object 'double[,]' $nLinhas, $Colunas
$dentro = New-Object 'bool[,]' $nLinhas, $Colunas
$vMin = 1.0; $vMax = 0.0
for ($r = 0; $r -lt $nLinhas; $r++) { for ($c = 0; $c -lt $Colunas; $c++) {
  $px = $reduzida.GetPixel($c, $r)
  $v = (0.299 * $px.R + 0.587 * $px.G + 0.114 * $px.B) / 255.0
  $lum[$r, $c] = $v
  $dentro[$r, $c] = $mascaraPeq.GetPixel($c, $r).R -gt 127
  if ($dentro[$r, $c]) { if ($v -lt $vMin) { $vMin = $v }; if ($v -gt $vMax) { $vMax = $v } } } }

$todos = New-Object System.Collections.Generic.List[double]
for ($r = 0; $r -lt $nLinhas; $r++) { for ($c = 0; $c -lt $Colunas; $c++) { if ($dentro[$r, $c]) { $todos.Add(($lum[$r, $c])) } } }
$todos.Sort(); $ordenados = $todos.ToArray()
$grade = @()
for ($r = 0; $r -lt $nLinhas; $r++) {
  $sb = New-Object System.Text.StringBuilder
  for ($c = 0; $c -lt $Colunas; $c++) {
    if (-not $dentro[$r, $c]) { [void]$sb.Append(' '); continue }
    $t = [Array]::BinarySearch($ordenados, ($lum[$r, $c])); if ($t -lt 0) { $t = -$t - 1 }; $t = $t / ($ordenados.Length - 1)
    if ($t -lt 0.0) { $t = 0.0 }; if ($t -gt 1.0) { $t = 1.0 }
    [void]$sb.Append([string][int][math]::Floor($t * 9.0 + 0.5))
  }
  $grade += $sb.ToString().TrimEnd()
}
$json = @{ colunas = $Colunas; linhas = $nLinhas; grade = $grade } | ConvertTo-Json -Compress
New-Item -ItemType Directory -Force (Split-Path $Saida) | Out-Null
[IO.File]::WriteAllText($Saida, $json)
$original.Dispose(); $contorno.Dispose()
"$Colunas x $nLinhas -> $Saida"
