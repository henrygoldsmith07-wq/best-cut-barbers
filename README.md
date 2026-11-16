# best-cut-barbers

Independent zero-dependency static site for Henry Goldsmith. Open index.html via any static server. No build or paid services required.

## Functional scope
The form prepares a visit note with the chosen service, preferred day, optional time and questions. The note is displayed for the visitor to copy or read out when calling; nothing is sent automatically and no booking is made. Contact links open the phone dialler. There are no prices, payments, checkout, confirmed bookings or delivery promises.

## Before owner launch
Confirm contact details, hours, service content and accessibility needs with the owner. Replace the candidate GitHub Pages canonical/social URLs with the actual deployment URL. Search indexing is blocked by robots.txt pending owner launch approval. Remove that block and submit sitemap.xml only at approved launch.

## Security and privacy
No third-party scripts, fonts, trackers, analytics or card handling. Executable JavaScript is self-hosted and the CSP permits only self scripts. Form input is inserted as text, never as HTML. The visit note stays in the current tab: nothing is stored on the device or sent to a server.

Prepared 15 November 2026.

## Verification — 15 November 2026
Browser checks: 375px, 390px, 768px and 1440px widths; no horizontal overflow. Form flows exercised without sending an email or calling. All local assets, scripts, JSON-LD, single h1 and external-link protections checked. Not tested: live telephone ownership, owner acceptance, live checkout, Safari/Firefox, Lighthouse, formal WCAG certification or Google Rich Results.

## 15 November 2026: reference-led design and evidence pass
See DESIGN.md for sources, design decisions and attribution. Live Maps and publicly accessible social details were audited; full private/social archives were not accessible. Site changes use confirmed details, original code-native illustrations and keyboard/touch interaction. No client launch or payments enabled.
## Final polish — 15 November 2026
Scroll-reveal section entrances (IntersectionObserver, reduced-motion safe), pointer parallax on the hero visual (fine-pointer only), Daisy shortlist-count pop feedback, and added structured data: contactPoint, hasOfferCatalog (barbers) and FAQPage schema, plus og:locale/og:site_name/twitter parity and sentence-case ribbon copy. All zero-dependency, still no pricing or unverified claims. Verified one h1, strict script policy, no overflow at 375/768/1440/1920, and keyboard/touch flows.

## Vibrancy pass — 15 November 2026
Brand-specific vibrancy layer appended to site.css: richer gradients and section depth, gradient headline/section headings, gradient primary buttons and glowing hover/selection states. All zero-dependency; respects prefers-reduced-motion; strict CSP unchanged; one h1 retained; no unverified claims added.

## Verification — 16 November 2026
Run `node verify.mjs` from the repository root to repeat the static checks without installing anything or starting a server. It checks the single h1, unique IDs, local asset references, CSS asset references and brace balance, that used HTML classes are styled, that JSON-LD parses, the strict script policy, and JavaScript syntax. A zero exit status means all checks passed. This complements, but does not replace, the manual browser checks recorded in QA-2026-11-16.md.

## Accessibility and verifier hardening — 16 November 2026
The skip link's target (`#main`) now has `tabindex="-1"`, so activating "Skip to content" reliably moves keyboard focus into the main landmark. The verifier gained four checks: in-page `href="#id"` links resolve to a real element, the skip-link target is focusable, `target="_blank"` links carry `rel="noopener"`, and no `http://` URLs are present. Each was confirmed to fail on a planted defect. Static checks now total 15; no business details, dependencies or publish settings changed.

## Reliability hardening — 16 November 2026
The opening-hours status no longer derives a weekday name from a hardcoded 15 November 2026 date; it uses an explicit Sunday-to-Saturday name list, so the displayed "next listed opening" is independent of the calendar date. The verifier gained three more checks: ARIA ID references (`aria-labelledby`, `aria-controls`, `aria-describedby`, `aria-owns`) resolve to real elements, every visible form control has a label or accessible name, and every `tel:` link digits match the telephone in JSON-LD. Each was confirmed to fail on a planted defect. The web app manifest now uses the business name and an honest description instead of the repository slug; the verifier also parses the manifest and checks that its local icon exists. Both new checks were confirmed to fail on planted defects. Static checks now total 20. No new dependencies, publish settings or business facts.

## Behaviour tests and security checks — 16 November 2026
The every-minute opening-hours refresh now writes the status only when its text changes, and `#visit-status` is a polite live region, so a real change is announced once instead of repeated each minute.

`tests/` adds zero-dependency behaviour coverage using small DOM stand-ins and Node's built-in test runner. `tests/visit-note.test.mjs` covers date bounds, a valid note, short names, dates outside the 120-day window, times outside opening hours, the honeypot, stale-result clearing, text-only insertion, copy success/failure and native validation blocking. `tests/hours.test.mjs` covers the open, pre-opening and post-closing statuses and the no-redundant-write guard. `tests/service-choice.test.mjs` checks that hero buttons, service links and the form select stay in sync; `tests/navigation.test.mjs` checks the mobile menu opens, closes on link click, Escape, outside click and the desktop breakpoint. Run `node --test tests/*.test.mjs`, or simply `node verify.mjs`, which discovers and runs every suite and counts them in its results.

`verify.mjs` also checks that the meta CSP appears before any script and that shipped runtime files contain no DOM XSS or code-execution sinks, inline handlers, remote scripts, web storage or cross-window messaging. A passive review against the frontend JavaScript security guidance found no such sinks in the shipped files. New checks were confirmed to fail on planted defects. No dependencies, publish settings or business facts changed.

## Robustness pass — 16 November 2026
The live "listed hours" status now writes to the page only when its text changes, and announces that change politely, so the once-a-minute timer no longer churns the DOM. The "next listed opening" weekday now comes from a fixed weekday-name list instead of a date anchored to 2026; both give the same English names, checked for all seven days. `verify.mjs` gained four checks: asset paths match exact case (GitHub Pages is case-sensitive), every form control has an accessible name, static `for` and ARIA references resolve, and the full `default-src`/`base-uri`/`object-src` policy is present. New-tab links must now carry both `noopener` and `noreferrer`. Each new check was confirmed to fail on a planted defect before the file was restored. No business details, dependencies, design direction or publish settings changed.

## Test-suite completion — 16 November 2026
`tests/copy.test.mjs` now covers the clipboard path in `SiteUX.copy`: clipboard success, the hidden-textarea fallback when the API is blocked, and cleanup when both paths fail. `verify.mjs` runs 26 checks and discovers five behaviour suites with 27 test cases in total. `node verify.mjs` and `node --test tests/*.test.mjs` both pass. Conflict markers left by a concurrent merge were removed and duplicate verifier declarations were consolidated, keeping both sides' checks.
