# AI reflection

**Where I used AI.** Claude Code was my pair programmer. It wrote first drafts of the templates, the build and test scripts and these docs, and it searched SendGrid's documentation as we worked. Before that, I used Claude.ai chat to plan the work and write the project brief, and Google to read the SendGrid docs myself. I set the direction, challenged the output with questions from my own experience, and approved each decision: segment-aware templates, impact.com's brand, scheduling outside SendGrid, a separate unsubscribe group.

**What I verified.** I read the generated files, clicked through and stress-tested the output, and ran the SendGrid and Gmail checks myself. No SendGrid claim went in on the AI's word. Each one in the integration doc links to its source. SendGrid's docs don't say whether nested `equals` works, so I pasted T2 into SendGrid's editor and checked all three branches. Sixteen sandbox API calls, three real sends to my own inbox and a read of the raw headers covered the rest.

**Where it was wrong.** It put Handlebars braces inside an HTML comment, which SendGrid would have tried to render. It predicted sandbox mode would reject an unverified sender; sandbox accepted it and only a real send caught it. It also invented the case-study figures, which are now marked as placeholders.

**Where not to rely on it.** Outlook and Apple Mail rendering has to be tested in Litmus. Deliverability needs real headers: my test failed DMARC, which no prompt would have told me. Legal details, customer claims and API keys need a person.

**How I'd use it next.** Generating edge-case fixtures, reviewing pull requests against our email rules and summarising Litmus results, with `npm test` and a human review between any AI output and a live send.
