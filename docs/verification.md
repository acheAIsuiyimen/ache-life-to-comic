# Verification

## Current result

- Skill files: 53
- Automated tests: 46 / 46
- Desktop render: PASS
- Mobile render: PASS
- Required images and console: PASS
- README effect showcase, book scene, static hero and animation: PASS
- README HD assets: hero 2400×1260; showcase 3600×2000; book scene 3600×2250; six route sheets 3600×1920
- README referenced-page rendering: every page loaded with `contain`; book-scene critical elements stay at least 36 px inside the canvas; showcase pages keep at least 45% visible area
- Public-source privacy scan: PASS; no local path, private identity, credential or provider-specific internal wording
- YAML: Ruby parser PASS
- Official `quick_validate.py`: PASS

## Seven hardening changes

1. Bounded one-year context through `context-pack.mjs`.
2. One-question-at-a-time onboarding through `onboarding.mjs`.
3. Five preset covers and one selector board.
4. Record-like user-visible language.
5. Pure-white page ground enforced in prompt and layout.
6. Deterministic typography, templates and layout cooldown.
7. One versioned design baseline reused across platforms and models.
8. One deterministic 3:4 renderer; platforms cannot replace it with a generic blog.
9. A separate presentation contract; required visuals need a real `displayed` receipt.
10. Balanced Chinese title wrapping and explicit handling for precomposed pages.

## Commands

```bash
node --test conformance/tests/*.test.mjs
node scripts/cli.mjs onboarding-start
```

The Skill package intentionally contains no provider credentials, local user data, `.env`, or provider-specific image configuration.
