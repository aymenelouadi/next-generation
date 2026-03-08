# Contributing to Discord Bot Dashboard

First off, thank you for considering contributing! Every contribution — whether it's a bug fix, new feature, or documentation improvement — helps make this project better for everyone.

Please take a moment to read these guidelines before submitting a contribution.

---

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Features](#suggesting-features)
  - [Submitting Pull Requests](#submitting-pull-requests)
- [Development Setup](#development-setup)
- [Coding Standards](#coding-standards)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Branch Naming](#branch-naming)

---

## 📜 Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment. Please be kind and constructive in all interactions.

---

## 🤝 How Can I Contribute?

### Reporting Bugs

Before opening a bug report:

1. **Search existing issues** to avoid duplicates.
2. **Reproduce the bug** on the latest version of the `main` branch.

When opening a bug report, use the **Bug Report** issue template and include:

- A clear, descriptive title
- Steps to reproduce the problem
- Expected vs. actual behavior
- Node.js version, OS, and any relevant logs
- Screenshots or error messages if applicable

### Suggesting Features

Feature requests are welcome! Before opening one:

1. Check if the feature is already on the roadmap or in existing issues.
2. Explain the use case clearly — why is this feature valuable?

Use the **Feature Request** issue template when submitting.

### Submitting Pull Requests

1. **Fork** the repository and create a branch from `main`.
2. Follow the [branch naming](#branch-naming) convention.
3. Make your changes following the [coding standards](#coding-standards).
4. Add or update tests if applicable.
5. Ensure the project builds and runs correctly.
6. Fill in the pull request template completely.
7. Link the related issue in your PR description (e.g., `Closes #123`).

PRs that do not follow these guidelines may be closed without review.

---

## 🛠️ Development Setup

```bash
# 1. Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/Bot-Discord-Dashboard-ALL-IN-ONE---Next-Generation.git
cd Bot-Discord-Dashboard-ALL-IN-ONE---Next-Generation

# 2. Install dependencies
npm install

# 3. Copy the environment file and fill in your values
cp .env.example .env

# 4. Start in development mode
npm run dev
```

---

## 📐 Coding Standards

- **Language:** JavaScript (ES2020+) — use `const`/`let`, async/await, and destructuring.
- **Formatting:** Follow the existing code style. The project uses 2-space indentation.
- **Error handling:** Always handle promise rejections and wrap async route handlers.
- **Comments:** Write clear JSDoc comments for exported functions.
- **No secrets:** Never hardcode tokens, passwords, or API keys. Use `.env` variables.

---

## ✍️ Commit Message Guidelines

This project follows the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <short description>

[optional body]

[optional footer]
```

**Types:**

| Type       | Description                                      |
|------------|--------------------------------------------------|
| `feat`     | A new feature                                    |
| `fix`      | A bug fix                                        |
| `docs`     | Documentation changes only                       |
| `style`    | Code style changes (formatting, no logic change) |
| `refactor` | Code refactoring (no feature/fix)                |
| `test`     | Adding or updating tests                         |
| `chore`    | Build process, dependencies, or tooling changes  |

**Examples:**

```
feat(commands): add /userinfo slash command
fix(dashboard): resolve session expiry issue on logout
docs(readme): update installation instructions
```

---

## 🌿 Branch Naming

Use the following naming convention for branches:

| Purpose         | Pattern                         | Example                       |
|-----------------|---------------------------------|-------------------------------|
| New feature     | `feat/<short-description>`      | `feat/music-commands`         |
| Bug fix         | `fix/<short-description>`       | `fix/ban-command-error`       |
| Documentation   | `docs/<short-description>`      | `docs/update-readme`          |
| Refactoring     | `refactor/<short-description>`  | `refactor/event-handler`      |
| Hotfix          | `hotfix/<short-description>`    | `hotfix/token-leak`           |

---

Thank you again for your interest in contributing! 🎉
