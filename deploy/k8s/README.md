# Kubernetes deploy (h3llo, salesdaily-dev)

Background — what is set up, cluster limitations, what must never be deleted,
how HTTPS works: `docs/deploy/k8s-dev-cluster.md`.

```bash
export KUBECONFIG=~/.kube/salesdaily-dev_kubeconfig.yaml
```

## ⛔ Public IP — do not break

`dev.salesdaily.ru` → **45.93.22.251**, the EXTERNAL-IP of Service
`traefik/traefik`. The provider binds the IP to that Service: **delete the
Service (or `helm uninstall traefik`, or the `traefik` namespace) and the IP
is gone for good** — the replacement gets a new address and DNS breaks.
Change Traefik only with `helm upgrade`.

## 1. Ingress controller (once)

```bash
helm repo add traefik https://traefik.github.io/charts && helm repo update
helm upgrade --install traefik traefik/traefik --version 41.7.1 \
  -n traefik --create-namespace -f deploy/k8s/infra/traefik-values.yaml
kubectl -n traefik get svc traefik     # EXTERNAL-IP → DNS A-record dev.salesdaily.ru
```

## 1b. TLS

Traefik's built-in ACME issues Let's Encrypt certificates (resolver
`letsencrypt`, configured in `infra/traefik-values.yaml`). cert-manager is
**on hold**: the hosted control plane can't reach in-cluster Services, so its
admission webhook times out. `infra/cert-manager-values.yaml` and
`infra/cluster-issuer.yaml` are kept for when h3llo enables
`--enable-aggregator-routing` / konnectivity.

## 2. Secrets (once, by hand — never committed)

```bash
kubectl create namespace salesdaily

# Pull access to the private GHCR image: a GitHub PAT (classic) with
# only `read:packages`.
kubectl -n salesdaily create secret docker-registry ghcr-pull \
  --docker-server=ghcr.io \
  --docker-username=<github-login> \
  --docker-password=<PAT>

# Runtime env: copy app/env.example OUTSIDE the repo, fill it in.
kubectl -n salesdaily create secret generic crm-env --from-env-file=<filled-file>
```

Changing a value later:

```bash
kubectl -n salesdaily create secret generic crm-env --from-env-file=<filled-file> \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n salesdaily rollout restart deploy/crm
```

## 3. App

Re-deploying a new release: **the `deploy` GitHub Actions workflow**
(button, also rollback) — `docs/deploy/ci-deploy.md`; its cluster identity
is `infra/github-deployer.yaml`. Manual fallback (build → tag → apply →
verify → rollback): `docs/deploy/k8s-release.md`. The tag in
`app/kustomization.yaml` is NOT what runs — the workflow overrides it.

```bash
# pin the image built by the docker-image workflow
(cd deploy/k8s/app && kustomize edit set image \
  ghcr.io/artuomvproskunin/ru-crm-v1=ghcr.io/artuomvproskunin/ru-crm-v1:dev-sha-<short>)

kubectl apply -k deploy/k8s/app
kubectl -n salesdaily rollout status deploy/crm
kubectl -n salesdaily get pods,svc,ingress,cronjob
```

## Checks

```bash
# app from inside the cluster
kubectl -n salesdaily run t --rm -i --restart=Never --image=curlimages/curl -- \
  curl -s http://crm/api/health

# through the ingress before DNS exists
curl -s http://<EXTERNAL-IP>/api/health -H 'Host: dev.salesdaily.ru'

# run the daily pipeline now (instead of waiting for 03:00 UTC)
kubectl -n salesdaily create job --from=cronjob/crm-daily-pipeline manual-$(date +%s)
kubectl -n salesdaily logs -f job/<job-name>
```
