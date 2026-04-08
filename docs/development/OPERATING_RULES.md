# Development Harness Operating Rules

## Deterministic CI vs Live Smoke

### Deterministic CI

Required CI checks must be:

- repeatable on a clean checkout
- credential-free
- non-interactive
- stable across local and GitHub runners

In this repository, deterministic checks include:

- `npm run build`
- `npm run test`
- `npm run agent-contracts`
- `npm run agent-docs`
- `npm run agent-check`

CI should install dependencies with `npm ci --ignore-scripts` so provider setup hooks do not attempt interactive or machine-specific installation.

### Live Smoke

Live smoke checks cover provider CLI login, Notion MCP connectivity, or other environment-specific behavior.

Rules:

- keep them out of required PR checks
- mark them as manual or advisory
- document exactly what credentials and setup they require
- never assume they are safe to run in CI

## Fixtures And Sanitized Artifacts

- Do not commit real `.forjob/` contents.
- Do not commit raw applicant data, personal drafts, or unsanitized run output.
- Prefer minimal synthetic fixtures in tests.
- If fixture structure changes, update only the smallest surface needed for deterministic coverage.
- Avoid baking provider-specific transient output into golden files unless the output is explicitly normalized first.

## Provider- Or Credential-Dependent Behavior

When a change touches provider execution, auth handling, or Notion integration:

- separate deterministic behavior from live behavior
- keep unit/integration coverage credential-free where possible
- document any manual smoke required after merge
- avoid making provider availability a precondition for normal CI

## WSL Extension Reapply Harness

WSL에서 설치된 ForJob 확장을 현재 저장소 코드로 다시 적용할 때는 설치 폴더를 수동으로 덮어쓰지 않는다.

Use:

```
./scripts/package-vsix.sh
./scripts/install-wsl-extension.sh
./scripts/verify-wsl-extension.sh
```

일상적인 개발 루프에서는 아래 명령을 우선 사용한다.

```
./scripts/deploy-wsl-extension.sh
```

이 하네스는 `build -> test -> VSIX 생성 -> WSL 설치 -> 버전 검증`을 표준 절차로 고정한다. 설치 후 UI 반영은 개발자가 직접 `Developer: Reload Window`를 실행한다.

## When To Update Fixtures

Update fixtures when:

- a deterministic contract intentionally changes
- parser/normalizer output changes in a stable and reviewed way
- a new regression needs a minimal reproduction

Do not update fixtures just to bless flaky output or hide an unexplained regression.

## No Real Secrets Or Personal Artifacts

Never commit:

- API keys
- OAuth tokens
- `.env` secrets
- `.forjob/` user content
- raw personal essays, resumes, or company notes
- copied provider transcripts containing sensitive user material

If a test needs representative content, synthesize it.

## Code Quality Gates

Run these checks after every non-trivial change:

```
node node_modules/typescript/bin/tsc --noEmit   # type correctness
npm run test                                      # deterministic test suite
```

### File Size Thresholds

Check file sizes before committing. If any threshold is exceeded, refactor before merging — do not defer.

| Category | Threshold | Refactoring action |
|---|---|---|
| Focused module (class, handler group, section file) | > 300 lines | Split into sub-modules |
| Facade / assembler file | > 150 lines | Move logic to delegate |
| Test file | > 400 lines | Split by concern |

Quick check:
```
wc -l src/core/storage.ts src/controller/forJobController.ts src/webview/sidebarScript.ts
```

### Architectural Invariants To Verify

Before opening a PR, confirm:

1. **No handler bodies in `forJobController.ts`** — handler map is populated by spreading `createXxxHandlers(this)` factories only.
2. **No logic in `ForJobStorage` methods** — each method is a one-liner delegating to `paths`, `manifest`, or `runs`.
3. **Consumers depend on narrow interfaces** — grep for `ForJobStorage` in `contextCompiler.ts`, `providers.ts`, `orchestrator.ts`, `sidebarStateStore.ts`; none should import it.
4. **`sidebarScript.ts` is an assembler** — it imports section constants and calls `materializeInlineScript`; it has no inline JS content.

## Human Review Is Mandatory When

- `agents/**` changes
- provider execution or auth flow changes
- Notion integration behavior changes
- `scripts/setup-providers.sh` changes
- `.github/**` changes required checks or merge policy
- `package.json` changes validation or install behavior
- a change alters stored run artifacts or persistence contracts

## Review Checklist For High-Risk Changes

- Did the change stay within the intended plane?
- Are deterministic checks sufficient for the change?
- Is a manual smoke still needed?
- Were any docs, templates, or harness commands updated?
- Could this change accidentally expose secrets or personal artifacts?

## Related Documents

- [Repository control plane](../../AGENTS.md)
- [Architecture overview](ARCHITECTURE.md)
- [Coding conventions](CODING_CONVENTIONS.md)
- [Failure taxonomy](../runbooks/failure-taxonomy.md)
