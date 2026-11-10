#!/usr/bin/env bash
set -euo pipefail
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
cat > "$scratch/kubectl" <<'MOCK'
#!/usr/bin/env bash
case "$1" in
create) cat >/dev/null;;
get) printf '{"status":{"conditions":[{"type":"%s","status":"True"}]}}' "$TEST_JOB_STATE";;
*) exit 99;;
esac
MOCK
chmod +x "$scratch/kubectl"
export PATH="$scratch:$PATH"
export MIGRATION_IMAGE="ghcr.io/example/crm@sha256:$(printf 'a%.0s' {1..64})" MIGRATION_JOB=crm-test
printf '#!/bin/sh\nexit 0\n' > "$scratch/sleep"
chmod +x "$scratch/sleep"
for state in Failed Running Complete; do
  export TEST_JOB_STATE="$state"
  rm -f "$scratch/rollout"
  # Same default success dependency as the following workflow Apply step.
  if bash scripts/migrations/deploy.sh && touch "$scratch/rollout"; then result=0; else result=$?; fi
  if [[ "$state" != Complete ]]; then
    [[ "$result" != 0 && ! -f "$scratch/rollout" ]]
  else
    [[ "$result" == 0 && -f "$scratch/rollout" ]]
  fi
done
# Assert that the actual workflow preserves the gating order and no bypass.
node <<'JS'
const fs=require('fs'),assert=require('assert/strict');
const s=fs.readFileSync('.github/workflows/dev.yml','utf8');
const start=s.indexOf('      - name: Migrate database before rollout');
const end=s.indexOf('      - name: Wait for rollout');
const gate=s.slice(start,end);
assert(start>0 && end>start);
assert(gate.includes('run: bash scripts/migrations/deploy.sh'));
assert(gate.indexOf('run: bash scripts/migrations/deploy.sh')<gate.indexOf('- name: Apply manifests'));
assert(!/continue-on-error|if:|always\(\)/.test(gate));
JS
echo 'PASS: failed Job blocks Apply; successful Job permits Apply; actual workflow gate checked'
