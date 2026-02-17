# Contributing

Thanks for contributing to the Recycling Swap-Shop software. This document explains the local setup and code standards.

## Setup

1. Install Node.js 22.18.0 (see `.nvmrc`).
2. Install dependencies: `npm install`
3. Enable Git hooks: `npm run prepare`

## Code Standards

- TypeScript is strict; avoid `any` unless justified.
- Formatting is enforced by Prettier.
- Linting is enforced by ESLint with type-aware rules.
- Pre-commit hooks run `lint-staged` to format and lint changed files.

## Useful Commands

- `npm run lint`
- `npm run lint:fix`
- `npm run format`
- `npm run format:write`

## Commit Expectations

- Keep commits focused and descriptive.
- Update or add documentation for any behavior change.

## Pull Requests

- Provide a clear summary and testing notes.
- Ensure the app still works offline for relevant changes.
