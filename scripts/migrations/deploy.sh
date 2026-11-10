#!/usr/bin/env bash
set -euo pipefail
: "${MIGRATION_IMAGE:?digest required}"
: "${MIGRATION_JOB:?job name required}"
[[ "$MIGRATION_IMAGE" =~ @sha256:[a-f0-9]{64}$ ]] || exit 1
node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync("deploy/k8s/migration-job.json")); j.metadata.name=process.env.MIGRATION_JOB; j.spec.template.spec.containers[0].image=process.env.MIGRATION_IMAGE; console.log(JSON.stringify(j))' | kubectl create -f -
# Poll both terminal conditions; kubectl wait Complete alone hides early failures.
for ((i=0;i<135;i++)); do
  result=$(kubectl get job "$MIGRATION_JOB" -o json)
  state=$(printf '%s' "$result" | node -e 'let s="";process.stdin.on("data",x=>s+=x).on("end",()=>{const c=JSON.parse(s).status?.conditions||[];console.log(c.find(x=>x.status==="True" && ["Complete","Failed"].includes(x.type))?.type||"Running")})')
  case "$state" in Complete) exit 0;; Failed) echo "Migration Job failed: $MIGRATION_JOB" >&2; exit 1;; esac
  sleep 5
done
echo "Migration Job timed out: $MIGRATION_JOB" >&2
exit 1
