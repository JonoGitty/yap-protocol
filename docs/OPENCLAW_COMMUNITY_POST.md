# OpenClaw Community Post Draft

Use this repo as an open-source alpha project, not a polished launch.

## Recommended Framing

Lead with:
- open-source alpha
- real code, not just an idea
- working protocol + SDK + tree + Claude MCP
- experimental OpenClaw skill scaffold
- looking for feedback from people who would actually use or build on it

Avoid leading with:
- production-ready
- security-complete
- fully launched
- done

## Ready To Post

Been building something called **Yap** and would really value thoughts from the OpenClaw community.

The basic idea is: instead of one AI turning structured intent into prose and another AI having to reconstruct that intent from the prose, agents should be able to exchange structured context directly, ask for missing bits, negotiate, and only bring the human back in when approval is actually needed.

So Yap is an attempt at an open protocol for that.

Current state:
- open-source alpha
- working relay/tree
- TypeScript SDK
- Claude MCP integration
- experimental OpenClaw skill scaffold
- local examples for things like scheduling / briefing / invoice-style flows

What it is **not**:
- not production-ready
- not security-audited
- not packaged/polished the way I'd want for a proper ClawHub release yet

I'm mainly sharing it now because I'd like honest feedback on:
- whether the protocol shape makes sense
- whether this is even the right abstraction for OpenClaw-style agents
- what the UX for consent / confirm / decline should look like in a messaging-first flow
- what real use cases would make this worth pushing further

Repo: https://github.com/JonoGitty/yap-protocol

If anyone is up for taking a look, I'd genuinely appreciate blunt feedback rather than polite encouragement.

## Shorter Version

I've been building **Yap**, an open-source alpha protocol for agent-to-agent coordination.

Idea: agents exchange structured context directly, negotiate, and only involve the human for approvals/exceptions, instead of turning everything into prose for another model to parse.

There’s real code there now:
- relay/tree
- TS SDK
- Claude MCP integration
- experimental OpenClaw skill scaffold

Still early:
- not production-ready
- not security-audited
- not polished for ClawHub yet

Would really value thoughts from OpenClaw people on whether the protocol + messaging UX direction is actually useful.

Repo: https://github.com/JonoGitty/yap-protocol

## If People Ask "What Needs Doing?"

Good answers:
- make the OpenClaw skill UX feel native in messaging
- tighten packaging and install path
- add stronger integration tests
- get an independent security audit before calling it trustworthy
- validate whether the protocol is genuinely useful outside toy demos

## What To Link In Replies

Point people to:
- `README.md` for the overview
- `examples/dinner-scheduler/` for the fastest end-to-end demo
- `packages/openclaw-skill/README.md` for the OpenClaw-facing integration
- `packages/claude-mcp/README.md` for the most complete current integration path

## Tone

Best tone:
"working alpha, sharing early, want honest thoughts"

That tends to land better than trying to sound more finished than it is.
