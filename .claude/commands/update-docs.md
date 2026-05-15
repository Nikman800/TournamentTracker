Update the project's living documentation to match the current state of the codebase. Do all of the following in a single response:

1. **Discover the current codebase structure** before reading or editing anything:
   - Glob `server/**/*.ts` — all server-side source files
   - Glob `shared/**/*.ts` — all shared source files
   - Glob `client/src/**/*.ts` and `client/src/**/*.tsx` — all frontend source files
   - Glob `tests/**/*` — all test files
   - Read `package.json` for scripts and dependencies
   - Read `.env` for environment variables
   - Read the existing `CLAUDE.md`, `tasks.md`, and `design.md` to understand what was previously documented
   - Then read the individual source files that are relevant to architecture, storage, routing, and configuration (use your judgment based on the glob results — you don't need to read every UI component, but you should read every file in `server/` and `shared/`)

2. **Update `CLAUDE.md`** so it accurately reflects:
   - All `npm run` scripts (add any new ones, remove obsolete ones)
   - The Database section: connection details, how to run db:push, which Postgres is in use
   - The Layer overview: every file in `server/` and `shared/` that has a meaningful architectural role, including any new files not previously documented
   - Any architectural invariants that would bite a future Claude (e.g. dotenv import order)
   - Whether tests exist and how to run them
   - Do NOT invent information — only write what is verifiably true from reading the files

3. **Update `tasks.md`**:
   - Mark any task `[x]` that is now fully implemented (verify against the actual code, not memory)
   - Mark any task `[-]` that is partially done
   - Leave `[ ]` for tasks with no implementation yet
   - Add a short implementation note to tasks completed since the last update, describing what was actually built (library choices, file locations, key decisions)
   - Do NOT change task descriptions or requirement references

4. **Update `design.md`**:
   - Correct any implementation details that diverged from the original design (e.g. different library, different file structure)
   - Add a note to the relevant section when an architectural decision was made differently than planned, explaining why
   - Do NOT rewrite sections that are still accurate — only fix what's wrong or missing

5. **Do NOT update `requirements.md`** — requirements describe what the system should do and are not affected by implementation choices.

After all edits, print a short summary (≤ 10 bullet points) of what changed across all three files.
