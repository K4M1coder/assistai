function Get-DemoPorts([string]$RecordDirectory) {
  $ports = [System.Collections.Generic.HashSet[int]]::new()
  foreach ($port in @(18093, 18094, 18095)) { [void]$ports.Add($port) }
  if (Test-Path -LiteralPath $RecordDirectory) {
    foreach ($recordFile in @(Get-ChildItem -LiteralPath $RecordDirectory -Filter 'demo-*-processes.json' -File)) {
      if ($recordFile.Name -notmatch '^demo-(\d+)-processes\.json$') { throw 'Invalid demo ownership record name' }
      $filenamePort = [int]$Matches[1]
      $record = Get-Content -Raw -LiteralPath $recordFile.FullName | ConvertFrom-Json
      $recordPort = 0
      if (![int]::TryParse([string]$record.port, [ref]$recordPort) -or $recordPort -ne $filenamePort -or $recordPort -lt 1024 -or $recordPort -gt 65535) {
        throw 'Invalid demo ownership record port'
      }
      [void]$ports.Add($recordPort)
    }
  }
  return @($ports | Sort-Object)
}
