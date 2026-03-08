# Security Policy

## Supported Versions

The following versions of this project currently receive security updates:

| Version | Supported          |
|---------|--------------------|
| Latest (`main` branch) | ✅ Yes |
| Older releases         | ❌ No  |

We strongly recommend always using the latest version from the `main` branch.

---

## Reporting a Vulnerability

If you discover a security vulnerability in this project, **please do not open a public GitHub issue**. Public disclosure of a vulnerability before a fix is available can put users at risk.

### How to Report

Please report security vulnerabilities by emailing the maintainer directly:

📧 **Contact:** Open a [GitHub Security Advisory](https://github.com/aymenelouadi/Bot-Discord-Dashboard-ALL-IN-ONE---Next-Generation/security/advisories/new) (private disclosure via GitHub).

### What to Include

To help us resolve the issue as quickly as possible, please include:

1. **Description** — A clear description of the vulnerability and its potential impact.
2. **Steps to reproduce** — Detailed steps to reproduce the issue.
3. **Affected versions** — Which version(s) are affected.
4. **Proof of concept** — A minimal example or code snippet demonstrating the issue (if applicable).
5. **Suggested fix** — If you have a recommended fix, please include it.

---

## Response Timeline

We take security vulnerabilities seriously and will respond as promptly as possible:

| Step                           | Timeline           |
|--------------------------------|--------------------|
| Acknowledgement of report      | Within **48 hours**  |
| Initial assessment & triage    | Within **7 days**    |
| Fix development & testing      | Within **30 days**   |
| Public disclosure (after fix)  | Coordinated release  |

---

## Security Best Practices for Users

To keep your deployment secure:

- **Never commit your `.env` file** — it contains your bot token and secrets.
- **Rotate your Discord bot token** immediately if it has been exposed. You can regenerate it in the [Discord Developer Portal](https://discord.com/developers/applications).
- **Use strong session secrets** for the dashboard (`SESSION_SECRET` in `.env`).
- **Restrict bot permissions** to the minimum required for your use case.
- **Keep Node.js and all dependencies up to date** to receive the latest security patches.
- **Run the bot with a non-root user** on Linux/Unix systems.
- **Use HTTPS** for the dashboard in production (e.g., via a reverse proxy like Nginx with Let's Encrypt).

---

## Scope

The following are **in scope** for security reports:

- Authentication or authorization bypass in the dashboard
- Injection vulnerabilities (SQL, NoSQL, command injection)
- Sensitive data exposure (tokens, credentials, user data)
- Cross-site scripting (XSS) or Cross-site request forgery (CSRF) in the dashboard
- Dependency vulnerabilities with a direct, exploitable impact

The following are **out of scope:**

- Vulnerabilities in Discord's own infrastructure
- Denial-of-service attacks against a user's own deployment
- Issues already publicly disclosed or already known

---

## Disclosure Policy

Once a fix has been developed and released:

1. We will publish a [GitHub Security Advisory](https://github.com/aymenelouadi/Bot-Discord-Dashboard-ALL-IN-ONE---Next-Generation/security/advisories) with full details.
2. The reporter will be credited (unless they prefer to remain anonymous).
3. We encourage coordinated disclosure and will work with reporters on the timeline.

Thank you for helping keep this project and its users safe! 🔒
