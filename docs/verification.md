# Verification

## Current result

- Skill files: 45
- Automated tests: 42 / 42
- Desktop render: PASS
- Mobile render: PASS
- YAML: Ruby parser PASS
- Official `quick_validate.py`: unavailable because the bundled Python environment does not include PyYAML

## Seven hardening changes

1. Bounded one-year context through `context-pack.mjs`.
2. One-question-at-a-time onboarding through `onboarding.mjs`.
3. Five preset covers and one selector board.
4. Record-like user-visible language.
5. Pure-white page ground enforced in prompt and layout.
6. Deterministic typography, templates and layout cooldown.
7. One versioned design baseline reused across platforms and models.

## Commands

```bash
node --test conformance/tests/*.test.mjs
node dist/codex/ache-life-to-comic/scripts/cli.mjs onboarding-start
```

The Skill package intentionally contains no provider credentials, local user data, `.env`, or provider-specific image configuration.
