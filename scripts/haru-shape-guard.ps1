function Assert-HaruShapeSample($sample,[long]$minimumRam,[long]$additionalShared=0) {
  if($sample.modelBusy){throw 'Existing inference slot is busy or unavailable'}
  if($sample.dedicatedBytes -gt 18GB){throw 'Dedicated GPU threshold exceeded'}
  if($sample.sharedBytes + $additionalShared -gt 256MB){throw 'Shared GPU threshold or preflight headroom exceeded'}
  if($sample.availableRamBytes -lt $minimumRam){throw 'Available RAM threshold exceeded'}
}
