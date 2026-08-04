# Verification

## Current result

- Skill files: 54
- Automated tests: 84 / 84
- Desktop render: PASS
- Mobile render: PASS
- Visual stress fixture: 5 routes / 10 pages / 7 required visuals; zero overflow, collision, crop, missing image or console error
- Required images and console: PASS
- README effect showcase, book scene, static hero and animation: PASS
- README HD assets: hero 2400×1260; showcase 3600×2000; book scene 3600×2250; six route sheets 3600×1920
- README referenced-page rendering: every page loaded with `contain`; book-scene critical elements stay at least 36 px inside the canvas; showcase pages keep at least 45% visible area
- Public-source privacy scan: PASS; no local path, private identity, credential or provider-specific internal wording
- YAML: Ruby parser PASS
- Official `quick_validate.py`: PASS
- Portable share: chapter / volume / part / book hierarchy PASS; light and faithful embedding PASS; skip-then-export PASS
- Standalone offline HTML: copied without `assets`, required images, desktop and 390 px mobile PASS

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
11. Default editable `HTML + assets` plus explicit light / faithful / skip portable export choices at four completion levels.
12. Image-aware frames: generated slots use exact target geometry; frame/image ratio drift above 2.5% fails closed.
13. HeyTea-like irregular edges only protect safe generated subjects; original photos use outer paper treatments without destructive masks.
14. Supporting illustrations require transparent raster or SVG; white rectangular pseudo-transparency is rejected.
15. Chapter palettes can follow style, reference and mood while the page ground stays pure white.
16. Every official monthly HTML carries a runtime layout guard and can be rechecked with `validate-html` after cross-platform delivery.

## Commands

```bash
node --test conformance/tests/*.test.mjs
node scripts/cli.mjs onboarding-start
node scripts/cli.mjs validate-html --input path/to/index.html
```

The Skill package intentionally contains no provider credentials, local user data, `.env`, or provider-specific image configuration.
