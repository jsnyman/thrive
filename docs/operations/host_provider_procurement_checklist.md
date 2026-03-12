# Host Provider Procurement Checklist

Use this checklist to buy the minimum hosted infrastructure for the pilot while keeping costs as low as possible.

## Recommended Buy-Now Stack

- Domain:
  - 1 `.org.za` domain
- DNS:
  - use the registrar's included DNS
- HTTPS:
  - use a free Let's Encrypt certificate
- Hosting:
  - 1 small Linux VM
- Database:
  - self-host PostgreSQL on the same VM for the pilot

This is the lowest-cost setup that still fits the current architecture.

## Buy-Now Requirements

### Domain Registrar

Buy from a registrar that provides:

- `.org.za` registration
- annual renewals
- DNS management
- support for `A`, `AAAA`, `CNAME`, and `TXT` records
- easy nameserver changes if you move later

### Host Provider

Buy from a provider that provides:

- 1 Linux VM with root or sudo access
- Ubuntu or Debian support
- at least:
  - 2 vCPU
  - 4 GB RAM
  - 40 GB SSD
- 1 public IPv4 address
- firewall or security group controls
- SSH key login
- monthly billing
- no long minimum contract
- snapshot or backup support

### TLS / HTTPS

Do not buy a paid certificate unless a funder, policy, or client explicitly requires it.

The hosting setup must support:

- Let's Encrypt certificate issuance
- automatic certificate renewal
- port `80` access for ACME HTTP validation or equivalent DNS validation

## Recommended Providers

### Default Lowest-Cost Option

- Domain:
  - xneelo `.org.za`
- VM:
  - Hetzner Cloud `CX23` or `CAX11`
- HTTPS:
  - Let's Encrypt

### Why This Option

- `.org.za` pricing is low
- DNS is included with the domain registrar
- Let's Encrypt avoids annual certificate cost
- Hetzner's small VMs are materially cheaper than most managed application and managed database combinations

## Budget

### Annual

- `.org.za` domain registration and renewal:
  - about `R105/year`

### Monthly

- Hetzner `CX23`:
  - about `EUR 3.49/month` before the April 2026 adjustment
  - about `EUR 4.09/month` after the April 2026 adjustment
- Hetzner `CAX11`:
  - about `EUR 4.49/month` after the April 2026 adjustment
- HTTPS certificate:
  - `R0`

### Budget Notes

- Registrar pricing is retail and can change.
- Hetzner pricing is location-dependent and excludes VAT in its English pricing references.
- You may also want to budget for backups if you use a paid snapshot feature.

## Recommended Purchase Sequence

1. Register the `.org.za` domain.
2. Leave DNS with the registrar initially.
3. Buy 1 Linux VM.
4. Point the domain `A` record to the VM IPv4 address.
5. Install the reverse proxy, app runtime, PostgreSQL, and backup job.
6. Issue a Let's Encrypt certificate.
7. Enable automatic renewal for both the domain and the certificate process.

## Fallback Option

If you want simpler support in South Africa and can accept higher monthly cost:

- use xneelo for the domain
- use a South African VPS or self-managed server provider
- still use Let's Encrypt instead of a paid certificate

This is usually easier administratively, but not the cheapest option.

## What Not To Buy Initially

- a paid SSL certificate
- a managed PostgreSQL service
- a separate DNS hosting product
- a load balancer
- multiple application servers
- a Windows server

## Sign-Off Checklist

- `.org.za` domain selected and available
- registrar account created
- DNS management confirmed
- Linux VM ordered
- VM public IP assigned
- SSH access working
- PostgreSQL plan decided:
  - self-hosted on same VM for pilot
- HTTPS plan confirmed:
  - Let's Encrypt
- recurring monthly and annual costs recorded
