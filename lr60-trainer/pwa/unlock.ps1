# Unlocks the LR60 Trainer: decrypts icons\lr60\app.enc.json back into lr60-trainer\index.html.
# Use it when the readable copy is missing (for example after an update made in another session).
# lr60-trainer\index.html is git-ignored, so the readable copy never gets published.
#
# Run it from a normal PowerShell window:   powershell -ExecutionPolicy Bypass -File unlock.ps1
param([string]$TestPassphrase)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$out  = Join-Path $root 'index.html'
$enc  = Join-Path (Split-Path -Parent $root) 'icons\lr60\app.enc.json'

$p = Get-Content $enc -Raw | ConvertFrom-Json

if ($TestPassphrase) { $pass = $TestPassphrase }
else {
  $s = Read-Host 'Passphrase' -AsSecureString
  $pass = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
}

$salt = [Convert]::FromBase64String($p.salt)
$iv   = [Convert]::FromBase64String($p.iv)
$ct   = [Convert]::FromBase64String($p.ct)
$mac  = [Convert]::FromBase64String($p.mac)

$kdf  = New-Object Security.Cryptography.Rfc2898DeriveBytes ([Text.Encoding]::UTF8.GetBytes($pass)), $salt, ([int]$p.iter), ([Security.Cryptography.HashAlgorithmName]::SHA256)
$keys = $kdf.GetBytes(64)
$encKey = [byte[]]$keys[0..31]; $macKey = [byte[]]$keys[32..63]
$pass = $null

# check the MAC first, so a wrong passphrase gives a clear message
$hmac = New-Object Security.Cryptography.HMACSHA256 (, $macKey)
$calc = $hmac.ComputeHash([byte[]]($iv + $ct))
if ([Convert]::ToBase64String($calc) -ne [Convert]::ToBase64String($mac)) { throw 'Wrong passphrase. Nothing was written.' }

$aes = [Security.Cryptography.Aes]::Create()
$aes.KeySize = 256; $aes.Mode = 'CBC'; $aes.Padding = 'PKCS7'; $aes.Key = $encKey; $aes.IV = $iv
$plain = $aes.CreateDecryptor().TransformFinalBlock($ct, 0, $ct.Length)

if (Test-Path $out) { Copy-Item $out ($out + '.bak') -Force }
[IO.File]::WriteAllBytes($out, $plain)
Write-Host ''
Write-Host ('Unlocked. Wrote ' + $out + ' (' + [math]::Round($plain.Length / 1KB) + ' KB).')
