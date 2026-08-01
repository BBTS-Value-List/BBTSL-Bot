# Contributing

Contributions are accepted when they fit BBTSL Bot and do not weaken access control.

## Rules

- Keep user-facing text in English.
- Use direct, specific wording.
- Do not trust Discord guild roles for BBTSL permissions.
- Keep staff actions behind the BBTSL API actor check.
- Do not add reset commands or reset helpers.
- Do not commit secrets, logs, or local env files.
- Keep public docs short and limited to setup, support, and safe operation.

## Local checks

```bash
npm run check
npm test
npm audit --audit-level=high
```

## Pull requests

Include:

- what changed;
- how it was tested;
- any access-control impact;
- screenshots for visible Discord UI changes.
