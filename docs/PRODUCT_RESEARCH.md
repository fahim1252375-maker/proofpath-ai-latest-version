# ProofPath AI product and design direction

## Scope

This pass started from the existing application in this repository and kept its student opportunity and evidence-verification purpose. Product research reviewed official product pages and help documentation for research grounding, contextual AI, workflow analytics, and report exports. This is a focused desk review, not a paid-account teardown or a full competitor usability study.

## Patterns that informed this pass

- **Perplexity:** makes source checking part of the answer itself through inline citations and a path from quick answers into deeper research. ProofPath should keep the claim, evidence, and uncertainty visible together rather than ask students to trust a single opaque score. [Perplexity product overview](https://www.perplexity.ai/hub)
- **ChatGPT:** separates quick conversation, longer work, and software development into distinct experiences. ProofPath has a similar distinction between public verification, a personalized workspace, and AI advising; route labels and dashboard actions make those jobs easier to reach. [ChatGPT Work and Codex](https://help.openai.com/en/articles/20001275/)
- **Claude:** Projects keep related chats and knowledge in a scoped workspace, while Artifacts present substantial results as standalone outputs. ProofPath's report view similarly keeps the generated summary attached to a reusable, inspectable audit record and PDF export. [Claude Projects](https://support.claude.com/en/articles/9517075-what-are-projects) · [Artifacts](https://support.anthropic.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them)
- **Linear:** connects planning, execution, and insights across one work lifecycle. Its cycle and dashboard documentation also frames analytics as operational context rather than decoration. ProofPath's dashboard prioritizes deadlines, next actions, match context, and readiness components. [Linear features](https://linear.app/features) · [Insights and analytics](https://linear.app/learn/insights-and-analytics)
- **Notion AI:** answers across a workspace and connected sources with citations back to those sources. This reinforces the need for traceable references in the bilingual advisor and verification history. [Notion AI connectors](https://www.notion.com/help/notion-ai-connectors)
- **Stripe Dashboard:** exposes transaction, payment, and payout reports for review and export. The relevant pattern for ProofPath is clear operational state and downloadable records, reflected in audit history, monitoring, and PDF report export; ProofPath does not implement billing. [Stripe reports](https://support.stripe.com/questions/stripe-reports)
- **Evidence and trust tooling:** Evidr's compliance product presents program status, evidence items, checks, and shared workflows. The adjacent-market lesson is to make the evidence trail and review state concrete. ProofPath keeps its own claim-level model and does not adopt compliance-product terminology. [Evidr compliance automation](https://evidr.com/product/compliance-automation)

## Reference site review

The supplied Fluid Studio reference was reachable in the browser. Its visible direction uses a misted grey-green field, unusually large type, editorial spacing, specimen imagery, and spatial compositions that build depth. Static browser inspection showed multiple compositions while scrolling; the precise animation triggers and timing could not be reliably measured in this environment, so those behaviors were not assumed.

ProofPath uses the reference only for restrained composition and depth cues: a softly layered canvas, deliberate headline scale, and a small evidence-trace illustration. The proof nodes, colors, copy, layout, and motion are original to this product. Scroll reveals use `IntersectionObserver`, animate once, and turn off for reduced-motion users; the report text remains available to assistive technology.

## Product decisions implemented

- Keep the existing directory, eligibility rules, student dashboard, application pipeline, evidence audit, AI advisor, trust monitoring, and role-protected operations console.
- Put the central product promise in the first screen: check opportunity claims against sources, then carry the verified opportunity into a student plan.
- Keep evidence and outcome states adjacent. The interface does not turn a missing source into a positive verdict.
- Keep demo listings and sample verification reports out of newly initialized production databases. New admin-created listings start as unverified until a reviewer checks the official source.
- Use the real public report and opportunity APIs when preview records exist. The diagram is explicitly labeled as a workflow preview when no public audit is available.
- Replace unsupported institutional subscription pricing and illustrative named leadership claims with accurate pilot availability and product principles.
- Preserve the current SQLite/Gemini stack and its real APIs. The repository already has persistence and domain logic; swapping the database or adding paid platform services would add migration risk without improving the requested student workflow.

## Known limits

- Reference animation inspection was visual and manual; exact easing, timing, and hover states could not be confirmed.
- This product review does not validate market size, pricing, or a complete accessibility conformance claim.
- Production AI analysis still requires `GEMINI_API_KEY`. SQLite durability depends on the host providing persistent storage, as described in the README.
- This change prevents new production databases from receiving bundled demo records. It does not rewrite existing databases; any listings already present in a live database need a separate review before they are presented as verified.
