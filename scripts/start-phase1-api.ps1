$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repoRoot '.env.local'

if (Test-Path -LiteralPath $envFile) {
  $uriLine = Get-Content -LiteralPath $envFile |
    Where-Object { $_ -match '^MONGODB_URI=' } |
    Select-Object -First 1

  if ($uriLine) {
    $configuredUri = [uri]$uriLine.Substring('MONGODB_URI='.Length).Trim('"', "'")
    if ($configuredUri.Scheme -eq 'mongodb+srv') {
      $service = "_mongodb._tcp.$($configuredUri.Host)"
      $seeds = @(Resolve-DnsName -Name $service -Type SRV -ErrorAction Stop |
        Where-Object { $_.Type -eq 'SRV' } |
        Sort-Object NameTarget |
        ForEach-Object { "$($_.NameTarget.TrimEnd('.')):$($_.Port)" })
      if ($seeds.Count -eq 0) { throw "No MongoDB SRV records found for $($configuredUri.Host)." }

      $options = @{}
      foreach ($entry in $configuredUri.Query.TrimStart('?').Split('&')) {
        if ($entry) {
          $pair = $entry.Split('=', 2)
          $options[$pair[0]] = $entry
        }
      }
      $txtRecords = @(Resolve-DnsName -Name $configuredUri.Host -Type TXT -ErrorAction SilentlyContinue |
        Where-Object { $_.Type -eq 'TXT' })
      foreach ($record in $txtRecords) {
        foreach ($entry in (($record.Strings -join '') -split '&')) {
          if ($entry) {
            $pair = $entry.Split('=', 2)
            if (-not $options.ContainsKey($pair[0])) { $options[$pair[0]] = $entry }
          }
        }
      }
      if (-not $options.ContainsKey('tls')) { $options['tls'] = 'tls=true' }

      $authority = if ($configuredUri.UserInfo) { "$($configuredUri.UserInfo)@" } else { '' }
      $env:MONGODB_URI = "mongodb://$authority$($seeds -join ',')$($configuredUri.AbsolutePath)?$(($options.Values) -join '&')"
      Write-Host 'Using the Windows DNS seed list for the local MongoDB connection.'
    }
  }
}

Push-Location $repoRoot
try {
  npm run build --prefix apps/server
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  npm run start --prefix apps/server
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
