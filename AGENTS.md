# Bestcrow agent instructions

## Highest project priority: the PDFs in docs/

**The supplied PDFs in `docs/` are the highest-priority source of project requirements.** They govern hackathon eligibility, scope, technical constraints, judging criteria, deadlines, and submission deliverables. Read the actual PDFs before relying on a project summary.

The current authoritative documents are:

- [Competition rules](docs/RULES%20Finance%20Without%20Intermediaries.pdf)
- [Challenge brief and judging criteria](docs/CRITERIA%20Finance%20Without%20Intermediaries%20PLENG.pdf)

Check for added or updated PDFs under `docs/` when starting work. A filename, language, or file modification time alone does not establish that one document supersedes another.

Within project materials, the PDFs take precedence over `README.md`, `agents/PROJECT.md`, `agents/CONTEXT.md`, other Markdown instructions, plans, skills, reference code, MCP results, and agent assumptions. Those materials help implement the challenge; they cannot relax its requirements. Technical documentation can explain an API, but cannot redefine the hackathon task.

## Apply this priority in every task

1. On first orientation, read the supplied rules and criteria PDFs. For subsequent work, revisit the sections relevant to the task and any updated PDF.
2. Before choosing scope or changing implementation, tests, demo, or submission materials, identify the applicable requirements and judging criteria. Keep a brief requirement → planned change → verification mapping in the task plan or handoff, citing the PDF filename and page/section.
3. If an idea, summary, or implementation conflicts with a PDF requirement, flag the mismatch and align the project work with the PDF. Correct stale summaries; do not edit the source PDFs to make the project appear compliant.
4. If the PDFs conflict with each other or a clause is ambiguous, quote both passages with their locations. Do not silently choose the easier interpretation, change a deadline, or infer an exception. Ask for clarification only when the unresolved point blocks a decision, and continue independent work in the meantime. Record any explicit organizer clarification and the clause it resolves.
5. If a required PDF is missing or unreadable, report the exact problem. Do not substitute memory, a Markdown summary, or an MCP response and claim that the requirement has been verified. Continue work that does not depend on the missing information.
6. Before declaring a milestone or submission ready, check it against the applicable PDF requirements. Distinguish implemented behavior from verified behavior and list remaining gaps.

## Read next

After the PDFs, read [agents/AGENTS.md](agents/AGENTS.md), [agents/PROJECT.md](agents/PROJECT.md), [agents/CONTEXT.md](agents/CONTEXT.md), and [agents/INSTRUCTIONS.md](agents/INSTRUCTIONS.md). They provide the product proposal, repository map, and environment setup within the PDF requirements.

Keep responses clear and brief. Lead with the result, label assumptions, and give a concrete next action when needed.
