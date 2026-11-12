param([string]$Wave,[string]$Ready,[string]$Play,[string]$Stop)
$player = New-Object System.Media.SoundPlayer
$player.SoundLocation = $Wave
$player.Load()
[System.IO.File]::WriteAllText($Ready, 'ready')
$playing = $false
while (-not (Test-Path -LiteralPath $Stop)) {
    if (-not $playing -and (Test-Path -LiteralPath $Play)) { $player.PlayLooping(); $playing = $true }
    Start-Sleep -Milliseconds 50
}
$player.Stop()
