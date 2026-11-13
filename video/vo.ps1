# Placeholder voiceover: Windows' built-in speech voices (the same engines the
# browser's Web Speech API uses, but this can write audio files).
#   powershell -File video/vo.ps1 [-Voice "Microsoft David Desktop"] [-Rate 1]
param([string]$Voice = 'Microsoft David Desktop', [int]$Rate = 1)
Add-Type -AssemblyName System.Speech
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $here 'build\vo'
New-Item -ItemType Directory -Force $out | Out-Null
$lines = Get-Content (Join-Path $here 'vo-lines.json') -Raw | ConvertFrom-Json
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SelectVoice($Voice)
$s.Rate = $Rate
foreach ($p in $lines.PSObject.Properties) {
  $s.SetOutputToWaveFile((Join-Path $out ($p.Name + '.wav')))
  $s.Speak($p.Value)
  $s.SetOutputToNull()
}
$s.Dispose()
Get-ChildItem $out | Select-Object Name, Length
