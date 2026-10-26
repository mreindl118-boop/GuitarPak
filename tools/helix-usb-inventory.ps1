# soundLAB - Helix Stadium USB inventory (READ-ONLY).
#
# Run after plugging the Stadium in (firmware 1.4 or later gives it a USB network
# link). It changes nothing: it lists the pedal's USB functions and their drivers,
# the network adapter the USB link created, that adapter's IPv6 addresses, whether
# p35x1.local resolves, and whether the pedal answers on port 2002 at the link's
# ::1 address - the same checks the bridge (tools/helix-bridge.js) makes.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/helix-usb-inventory.ps1
#   ... -Json   (machine-readable, for a task record)
param([switch]$Json)

$out = [ordered]@{ when = (Get-Date).ToString('s'); pedal = @(); adapters = @(); ipv6 = @(); mdns = $null; probe = @() }

# 1. The pedal's USB functions and the driver bound to each (VID 0E41 = Line 6)
$pnp = Get-PnpDevice -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -match 'VID_0E41' }
foreach ($d in $pnp) {
  $svc = (Get-PnpDeviceProperty -InstanceId $d.InstanceId -KeyName 'DEVPKEY_Device_Service' -ErrorAction SilentlyContinue).Data
  $inf = (Get-PnpDeviceProperty -InstanceId $d.InstanceId -KeyName 'DEVPKEY_Device_DriverInfPath' -ErrorAction SilentlyContinue).Data
  $out.pedal += [ordered]@{ name = $d.FriendlyName; class = $d.Class; status = $d.Status; present = $d.Present; service = $svc; inf = $inf; id = $d.InstanceId }
}

# 2. Network adapters that look like the USB link (Windows' in-box CDC-NCM driver, or a Line 6 name)
$nics = Get-NetAdapter -IncludeHidden -ErrorAction SilentlyContinue | Where-Object { $_.InterfaceDescription -match 'NCM|Helix|Stadium|Line ?6|USB Ethernet' -or $_.Name -match 'Helix|Stadium' }
foreach ($n in $nics) {
  $out.adapters += [ordered]@{ name = $n.Name; description = $n.InterfaceDescription; status = $n.Status; ifIndex = $n.ifIndex; mac = $n.MacAddress }
  $addrs = Get-NetIPAddress -InterfaceIndex $n.ifIndex -AddressFamily IPv6 -ErrorAction SilentlyContinue
  foreach ($a in $addrs) { $out.ipv6 += [ordered]@{ adapter = $n.Name; address = $a.IPAddress; prefix = $a.PrefixLength; origin = "$($a.PrefixOrigin)/$($a.SuffixOrigin)" } }
}

# 3. Does the pedal's name resolve (mDNS / Bonjour over any link)?
try { $r = Resolve-DnsName -Name 'p35x1.local' -ErrorAction Stop | Select-Object -First 3; $out.mdns = @($r | ForEach-Object { "$($_.Type) $($_.IPAddress)" }) } catch { $out.mdns = 'no answer' }

# 4. Probe the link's ::1 (the pedal addresses itself as <prefix>::1 on the USB link) on port 2002
foreach ($a in $out.ipv6) {
  $addr = $a.address
  if ($addr -match '^f[cd]') {
    $cand = ($addr -replace '::.*$', '') ; if ($cand -eq $addr) { $cand = (($addr -split ':')[0..3] -join ':') }
    $cand = "$cand::1"
    if ($cand -eq $addr) { continue }
    $ok = $false
    try { $tc = Test-NetConnection -ComputerName $cand -Port 2002 -WarningAction SilentlyContinue -InformationLevel Quiet; $ok = [bool]$tc } catch { $ok = $false }
    $out.probe += [ordered]@{ adapter = $a.adapter; candidate = $cand; port2002 = $ok }
  }
}

if ($Json) { $out | ConvertTo-Json -Depth 5; exit 0 }

"Helix Stadium USB inventory - $($out.when) (read-only)"
"`nPedal USB functions (VID 0E41):"
if ($out.pedal.Count -eq 0) { "  none present - is the pedal plugged in and powered?" }
foreach ($p in $out.pedal) { "  {0,-40} {1,-10} {2,-8} service={3} inf={4}" -f $p.name, $p.class, $p.status, $p.service, $p.inf }
"`nUSB-link network adapters:"
if ($out.adapters.Count -eq 0) { "  none - on firmware 1.4 Windows should bind its UsbNcm driver and show one here (Device Manager > Network adapters)" }
foreach ($n in $out.adapters) { "  {0,-20} {1,-40} {2}" -f $n.name, $n.description, $n.status }
foreach ($a in $out.ipv6) { "    IPv6 on $($a.adapter): $($a.address)/$($a.prefix) ($($a.origin))" }
"`np35x1.local: $($out.mdns -join ', ')"
"`nPort 2002 at the link's ::1:"
if ($out.probe.Count -eq 0) { "  no ULA (fd..) address on a USB adapter yet - nothing to probe" }
foreach ($p in $out.probe) { "  $($p.candidate) via $($p.adapter): " + $(if ($p.port2002) { 'ANSWERS - the bridge can edit over USB' } else { 'no answer (Remote Access on? firmware 1.4?)' }) }
