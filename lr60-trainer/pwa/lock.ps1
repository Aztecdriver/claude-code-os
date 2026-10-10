# Locks the LR60 Trainer with a passphrase so it can sit on a public web address.
# It encrypts lr60-trainer\index.html into lr60-trainer\site\app.enc.json.
# Only the encrypted file is published; the page asks for the passphrase and decrypts it on the phone.
#
# Run it from a normal PowerShell window:   powershell -ExecutionPolicy Bypass -File lock.ps1
param([string]$TestPassphrase)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$src  = Join-Path $root 'index.html'
# The site's deploy step publishes the icons folder, so the locked copy lives inside it.
$site = Join-Path (Split-Path -Parent $root) 'icons\lr60'

if ($TestPassphrase) { $pass = $TestPassphrase }
else {
  $s1 = Read-Host 'Choose a passphrase (at least 14 characters; four random words work well)' -AsSecureString
  $s2 = Read-Host 'Type it again' -AsSecureString
  $toPlain = { param($s) [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)) }
  $pass = & $toPlain $s1
  if ($pass -cne (& $toPlain $s2)) { throw 'The two entries did not match. Nothing was written.' }
  if ($pass.Length -lt 14) { throw 'Use at least 14 characters. The encrypted file is public, so a short passphrase can be guessed by brute force.' }
}

$iter  = 600000
$rng   = [Security.Cryptography.RandomNumberGenerator]::Create()
$salt  = New-Object byte[] 16; $rng.GetBytes($salt)
$iv    = New-Object byte[] 16; $rng.GetBytes($iv)
$kdf   = New-Object Security.Cryptography.Rfc2898DeriveBytes ([Text.Encoding]::UTF8.GetBytes($pass)), $salt, $iter, ([Security.Cryptography.HashAlgorithmName]::SHA256)
$keys  = $kdf.GetBytes(64)
$encKey = $keys[0..31]; $macKey = $keys[32..63]

$plain = [IO.File]::ReadAllBytes($src)
$aes = [Security.Cryptography.Aes]::Create()
$aes.KeySize = 256; $aes.Mode = 'CBC'; $aes.Padding = 'PKCS7'; $aes.Key = $encKey; $aes.IV = $iv
$ct = $aes.CreateEncryptor().TransformFinalBlock($plain, 0, $plain.Length)

# encrypt-then-MAC over iv + ciphertext
$hmac = New-Object Security.Cryptography.HMACSHA256 (, [byte[]]$macKey)
$mac  = $hmac.ComputeHash([byte[]]($iv + $ct))

$b64 = { param($b) [Convert]::ToBase64String([byte[]]$b) }
$json = '{"v":1,"iter":' + $iter + ',"salt":"' + (& $b64 $salt) + '","iv":"' + (& $b64 $iv) + '","mac":"' + (& $b64 $mac) + '","ct":"' + (& $b64 $ct) + '"}'
[IO.File]::WriteAllText((Join-Path $site 'app.enc.json'), $json, (New-Object Text.UTF8Encoding($false)))

$pass = $null
Write-Host ''
Write-Host ('Locked. Wrote ' + (Join-Path $site 'app.enc.json') + ' (' + [math]::Round($json.Length / 1KB) + ' KB).')
Write-Host 'Keep the passphrase somewhere safe. It cannot be recovered; you would have to run this again with a new one.'
