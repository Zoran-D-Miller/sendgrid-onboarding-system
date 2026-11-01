# QA checklist: onboarding email series

This is the launch checklist for the three onboarding emails and the signup-to-SendGrid integration. Most of it has already been run. Each row says how it's checked, with what, what counts as a pass, and where it stands today.

**Status key**

| Status | Meaning |
|---|---|
| PASS | Run and passed. Evidence linked or described. |
| AUTO | Covered by `npm test`, which runs locally and in CI on every push |
| PRE-LAUNCH | Not possible without impact.com's accounts or production setup (Litmus, authenticated domain, staging service). Must pass before go-live. |
| FINDING | Testing showed something the docs didn't say. The action taken is in the row. |

## How the testing is layered

Each layer catches something the one before it can't.

| Layer | What it proves | Run so far |
|---|---|---|
| 1. `npm test` (local + GitHub Actions) | Templates build, every template renders against every fixture, mapping and subjects are right, structural rules hold | 95 checks pass, CI green |
| 2. SendGrid editor preview | SendGrid's own Handlebars engine renders the conditionals the same way | Nested `equals`: enterprise / startup / unknown all correct |
| 3. Sandbox API calls | SendGrid accepts the exact request the service will send | 17 calls: 9 sends + 8 error cases ([evidence](evidence/sandbox-run.md)) |
| 4. Live send to own inbox | Real render, real headers, real unsubscribe, real redirects | 3 emails to a Gmail inbox ([evidence](evidence/live-send.md)) |
| 5. Litmus across clients | Rendering in Outlook, Apple Mail, Yahoo, Samsung and the rest | PRE-LAUNCH |
| 6. Staging end-to-end | Signup webhook to service to SendGrid to Event Webhook to `email_events` | PRE-LAUNCH |
| 7. Post-launch monitoring | Bounce, complaint and engagement by segment, with alerts | Defined in section 6 |

## 1. Rendering across clients

**Tool:** Litmus (impact.com's existing tool) for the client matrix. Gmail checked by hand with real sends.

| Client | Why it's on the list | How | Pass criteria | Status |
|---|---|---|---|---|
| Gmail web (Chrome) | Largest share of B2B inboxes | Live send | Layout, fonts, buttons, footer as designed | PASS |
| Gmail app (mobile) | Most onboarding emails are opened on a phone | Live send, opened on phone | Single column, full-width buttons, no sideways scroll | PASS |
| Gmail app, dark mode | Gmail recolours some dark-mode emails | Live send, phone in dark mode | Text readable, buttons visible | PASS |
| Outlook 2016 / 2019 / 365 (Windows) | Renders with Word: no `border-radius`, limited CSS, web fonts fall back to Times New Roman | Litmus | 600px column holds; buttons show as square blocks; Arial, not Times; no gaps between rows | PRE-LAUNCH |
| New Outlook / Outlook.com | Different engine from desktop Outlook, handles dark mode its own way | Litmus | Same as above, plus dark mode readable | PRE-LAUNCH |
| Apple Mail (macOS, iOS) | Supports our dark-mode styles and Lexend; Mail Privacy Protection affects opens | Litmus + an iPhone | Lexend loads; dark-mode palette applies; outlined buttons flip to light | PRE-LAUNCH |
| Yahoo Mail, Samsung Mail | Strip or rewrite some CSS | Litmus | Layout holds without the `<style>` block | PRE-LAUNCH |
| Images off | Many corporate clients block images by default | Litmus "images off" view | Every image has alt text; logo alt reads "impact.com"; nothing important lives only in an image | AUTO (alt text) / PRE-LAUNCH (visual) |
| Widths 320 / 375 / 600 px | Phones to desktop reading pane | `npm run screenshots` at 375 and 640 | No overflow, buttons stack, headline scales | PASS ([screenshots](screenshots/)) |
| Gmail clipping | Gmail cuts messages over ~102KB, hiding the footer and unsubscribe | `check.js` measures every rendered preview | Every preview under 102KB (largest is about 18KB) | AUTO |
| Design matches the mockups | The design team's Figma files are the reference | Side by side in Figma, design sign-off in Jira | Spacing, type and colour within agreed tolerance | PRE-LAUNCH |

## 2. Data accuracy

**Tool:** fixtures in `fixtures/`, `npm test`, live send.

| Check | How | Pass criteria | Status |
|---|---|---|---|
| First name in greeting and T1 subject | Fixtures + live send | "Hi Zoran," / "Welcome to impact.com, Zoran" | AUTO + PASS (live) |
| Missing or blank first name | Edge fixture (`first_name: ""`), mapping test with `"   "` | "Hi there,", subject without a name, no `to.name` | AUTO |
| Company name with `&` or HTML | Edge fixture `Smith & Sons <b>Ltd</b>` | Shown as text, never as markup | AUTO |
| Subject line per segment | `check-mapping.js` renders all 9 subject x fixture pairs | Matches the table in INTEGRATION.md 3.2 | AUTO + PASS (live, 3 of 9) |
| Preheader per segment | Live send, inbox list view | Preheader text shows, not "Hi Zoran..." | PASS |
| From name, from address, reply-to | Live send headers | `"impact.com" <sender>`; reply-to "impact.com Onboarding" | PASS |
| Every link https and UTM-tagged | `check.js` | All links https; all impact.com links carry `utm_source=sendgrid` and a unique `utm_content` | AUTO |
| Links resolve | Click each button on the live send | Redirect through SendGrid click tracking to the right path | PASS (redirect). Destinations are placeholders and return 404; PRE-LAUNCH: swap in real app URLs and re-check |
| Plain-text part exists and reads well | Live send source shows `text/plain`, generated by SendGrid (`generate_plain_content`) | Present; links and footer readable | PASS (present) / PRE-LAUNCH (read-through) |
| Physical address and unsubscribe in footer | `check.js` + live send | Both present in every template | AUTO + PASS |
| No personal data in tracking fields | `check-mapping.js` | `custom_args` contain no email, name or company | AUTO |

## 3. Dynamic content (conditional logic)

**Tool:** fixture matrix in `npm test`, SendGrid editor Test Data.

| Check | How | Pass criteria | Status |
|---|---|---|---|
| T2: enterprise / startup / anything else | 3 fixtures x T2 | Each shows its own block, and only that block | AUTO |
| T3: finance / retail / anything else | 3 fixtures x T3 | Same | AUTO |
| Nested `equals` works in SendGrid itself | T2 pasted into SendGrid Code Editor; Test Data set to `enterprise`, `startup`, `agency` | Correct block each time. SendGrid's docs don't cover nesting, so this was checked rather than assumed. | PASS |
| Case and whitespace (`" Enterprise "`, `"RETAIL"`) | `check-mapping.js` | Normalised to lowercase before sending, so the right block shows | AUTO |
| Missing `account_type` / `industry` | `check-mapping.js` | Default block; tracked as `unknown` | AUTO |
| Unknown values seen in production | Weekly query on `email_events` for `account_type`/`industry` = `unknown` or unmapped | Reviewed with product; new segments get a block | Post-launch |
| Every template renders without leftover tags | `check.js` searches previews for `{{` / `}}` | None | AUTO |
| No Handlebars inside HTML comments | `check.js` | None. SendGrid parses comments too, and this broke the first draft. | AUTO |

## 4. Engagement tracking

| Check | How | Pass criteria | Status |
|---|---|---|---|
| Click tracking rewrites links | Live send: button opened via SendGrid's redirect | Redirect then destination | PASS |
| Open pixel inserted once | Live send HTML source: one SendGrid pixel; templates contain none | Exactly one tracking pixel | PRE-LAUNCH (view source on a staging send) |
| `custom_args` arrive on events | Staging Event Webhook to `email_events`; check one row per event type | `user_id`, `template_key`, `sequence_step`, `account_type`, `industry` populated | PRE-LAUNCH. "Test Integration" in SendGrid sends sample events only, and this trial plan returns 403 on the Email Activity API. |
| Event Webhook signature verified | Unit test with SendGrid's sample signed payload; also send a tampered body | Valid accepted; tampered or old timestamp rejected with 403 | PRE-LAUNCH |
| Duplicate events ignored | Post the same batch twice | Second insert adds no rows (`sg_event_id` unique) | PRE-LAUNCH |
| Test sends excluded from reporting | Live sends carry category and custom_arg `qa_test` | Dashboards filter `qa_test = true` out | PASS (tagging) |
| UTMs reach product analytics | Click a staging link, check the analytics session | Source `sendgrid`, campaign `onboarding`, content = button key | PRE-LAUNCH |
| Opens read correctly | Compare opens on Apple Mail recipients with clicks | Team reports clicks as the primary metric; opens inflated by Mail Privacy Protection | Documented (INTEGRATION.md 5.5) |
| Bot clicks | Look for clicks on every link within seconds of `delivered` | Filtered before reporting click rate | Post-launch |

## 5. API and integration error scenarios

| Scenario | Expected behaviour | How tested | Status |
|---|---|---|---|
| Missing `email` | Service rejects (422), no SendGrid call | `check-mapping.js` + sandbox run | AUTO + PASS |
| Invalid email format | Same | `check-mapping.js` | AUTO |
| Missing `user_id` / bad `signup_date` | Same | `check-mapping.js` | AUTO |
| Unknown `account_type` / `industry` | Send with default block, log the value | Fixtures + mapping test | AUTO |
| Duplicate signup webhook | Second one returns 200, sends nothing (`user_id:template_key` unique) | Unit test on the service's insert | PRE-LAUNCH (idempotency key tested in `check-mapping.js`; the database constraint lives in the service) |
| Invalid API key | `401`, no retry, alert | Sandbox run | PASS |
| Template ID that doesn't exist | `400`, no retry, alert | Sandbox run | PASS |
| No recipients | `400` | Sandbox run | PASS |
| More than 10 categories | `400` | Sandbox run | PASS |
| `send_at` more than 72 hours ahead | `400`. This is why the service schedules T2/T3 itself. | Sandbox run | PASS |
| Unverified `from` address | `403` on a real send | Sandbox **accepted** it (`200`); a real send returned `403` | FINDING: sandbox doesn't check sender identity. A real send per template is part of launch. |
| `custom_args` value not a string | Docs say `400` | Sandbox **accepted** it | FINDING: mapping code converts every value to a string, tested in `check-mapping.js` |
| `429` rate limit | Wait for `X-RateLimit-Reset`, else back off | Mock SendGrid in the service's tests | PRE-LAUNCH |
| `5xx` from SendGrid | Retry with backoff 1, 2, 4, 8, 16s, then fail and alert | Mock SendGrid | PRE-LAUNCH |
| SendGrid down for an hour | Jobs stay queued and send when it recovers; no duplicates | Staging: block outbound calls, then restore | PRE-LAUNCH |
| Recipient unsubscribed from the group | SendGrid suppresses (`dropped`); remaining sequence cancelled | Clicked footer unsubscribe on a live send; API showed the address in the Onboarding group only, **not** globally. Removed again afterwards. | PASS |
| Hard bounce | Remaining sends cancelled for that user | Staging send to a non-existent mailbox on a domain we control | PRE-LAUNCH |
| Event Webhook signature invalid | `403`, nothing stored | Unit test | PRE-LAUNCH |

## 6. Deliverability and monitoring

### Before launch

| Check | How | Pass criteria | Status |
|---|---|---|---|
| Sending domain authenticated | SendGrid Domain Authentication for a subdomain such as `mail.impact.com` (DKIM CNAMEs + custom return path); DMARC record on impact.com | Message source shows `dkim=pass` and `dmarc=pass` for the impact.com domain | PRE-LAUNCH. **Blocker.** See finding below. |
| One-click unsubscribe headers | Message source | `List-Unsubscribe` (https + mailto) and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, both covered by the DKIM signature | PASS (SendGrid adds them automatically when `asm.group_id` is set) |
| Inbox placement | Live send to Gmail, plus a seed list (Gmail, Outlook, Yahoo) once the domain is authenticated | Primary or Promotions, not Spam | FINDING on the test sender, PRE-LAUNCH on the real domain |
| Volume ramp | New subdomain starts at low daily volume and grows over 2 to 4 weeks | No deferral spikes during the ramp | PRE-LAUNCH |

**Finding: the live test landed in spam, and DMARC failed.** The test used a free gmail.com address as the sender. SPF passed for SendGrid's bounce domain and DKIM passed for `sendgrid.net`, but neither matched `gmail.com`, so DMARC failed (`dmarc=fail (p=NONE ...) header.from=gmail.com`) and Gmail filtered the mail to spam. This is the expected result without domain authentication, and it's why the integration doc makes an authenticated impact.com subdomain a launch requirement. The same headers confirmed the one-click unsubscribe is set up correctly, so authentication is the only gap.

### After launch

Data comes from `email_events` (Event Webhook) and SendGrid stats by category, plus Google Postmaster Tools for the sending domain.

| Metric | Healthy | Alert when | Action |
|---|---|---|---|
| Delivered rate (delivered / processed) | Above 98% | Below 95% over a day | Check bounces and blocks by mailbox provider |
| Hard bounce rate | Below 1% | Above 2% | Check signup validation, look for a bad signup source |
| Spam complaint rate | Below 0.1% | 0.1% or more; Gmail and Yahoo act at 0.3% | Pause the sequence, review copy and frequency |
| Deferred | Occasional | Spike at one provider | Slow the send rate to that provider, check reputation |
| Unsubscribe rate per template | Steady | One template far above the others | Review that email's content and timing |
| Click rate by template and segment | Baseline set in the first two weeks | Segment drops sharply | Check the segment's block renders and links work |
| `unknown` segment share | Low | Rising | A new `account_type` or `industry` value is arriving; add a block |

## 7. Go / no-go

All of these must be true before the series goes live:

- [ ] `npm test` and CI green on the release commit
- [ ] Templates deployed from that commit (version name `git-<sha>`, not `-dirty`)
- [ ] Litmus pass on the Outlook, Apple Mail, Gmail and Yahoo set
- [ ] Sending subdomain authenticated; test send shows `dmarc=pass`
- [ ] One real send per template from the production sender, inspected by hand
- [ ] Placeholder links, logo, case-study figures and footer address replaced and confirmed
- [ ] Event Webhook signed, receiving in staging, `custom_args` present on rows
- [ ] Alerts from section 6 configured
- [ ] Design sign-off against Figma, product sign-off on copy

## What testing has caught so far

| Found by | Problem | Fix |
|---|---|---|
| Local render | Handlebars braces inside an HTML comment would have broken the render in SendGrid | Comments rewritten; `check.js` now fails on it |
| Code review against Outlook's rules | Fonts don't carry into nested tables in Outlook | `font-family` set on every text cell |
| Mobile screenshot | A button label wrapped onto two lines at 375px | Shorter label |
| Design review | A red image placeholder competed with the red button | Neutral placeholder; one accent colour per email |
| Sandbox run | Sandbox accepts an unverified sender and non-string `custom_args` | Real-send step added to launch; strings enforced in code |
| Live send | `403` until the sender was verified | Sender verified; same check belongs in the launch list |
| Live send | Spam placement from DMARC failure | Domain authentication marked as a launch blocker |
