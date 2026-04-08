## Summary

- What changed?
- Why was it needed?

## Files Changed

- List the main files or areas touched.

## Validation

- [ ] `npm run build`
- [ ] `npm run test`
- [ ] `npm run agent-contracts`
- [ ] `npm run agent-docs`
- [ ] `npm run agent-check`
- [ ] `npm run smoke:local`
- [ ] `npm run smoke:live` was not required or was run safely

Paste command results or summarize failures/skips:

```text
[validation notes here]
```

## High-Risk Paths

- [ ] `agents/**`
- [ ] `src/core/orchestrator.ts`
- [ ] `src/core/providerStreaming.ts`
- [ ] `src/core/notionMcp.ts`
- [ ] `src/controller/runSessionManager.ts`
- [ ] `scripts/setup-providers.sh`
- [ ] `package.json`
- [ ] `README.md`
- [ ] `.github/**`

If any box is checked, explain what extra review or validation was done.

## Data And Security

- [ ] No real secrets were committed.
- [ ] No `.forjob/` user data or unsanitized personal artifacts were committed.
- [ ] Any provider- or credential-dependent behavior is clearly documented as manual/advisory.

## Reviewer Guidance

- Areas where you want especially close review:
- Manual follow-up or GitHub UI settings needed:
