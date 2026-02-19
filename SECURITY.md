# Security Policy

## Supported Versions

clime is actively maintained on `main`.

## Reporting a Vulnerability

Please do **not** open public issues for security vulnerabilities.

Report privately via:

- Email: `security@clime.sh`
- Include: affected area, reproduction steps, impact, and suggested fix (if known)

We will acknowledge receipt as quickly as possible and coordinate remediation and disclosure.

## Security Baseline

- `install --run` is blocked unless a real SHA-256 checksum is available.
- CORS is restricted to explicit origins.
- Rate limiting is enabled by default.
- Secrets must not be committed to the repository.
