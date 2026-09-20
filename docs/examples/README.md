# Example school papers

Synthetic but realistic documents for testing decode. Dates are relative to **September 2026** (the hackathon), so urgency groups line up. Upload any mix of these at `/en`, `/es`, `/vi`, `/zh`.

| File | Language | What should come out |
|---|---|---|
| `01-en-permission-slip.png` | English | Sign slip + pay **$12** by **Sep 26** (signature); zoo trip **Oct 2** (event); chaperone reply |
| `02-en-pta-newsletter.png` | English | PTA meeting **Sep 29 6:30pm**; conference reply by **Sep 30** (needs_reply); Picture Day **Oct 8**; Fall Festival **Oct 18 4–7pm $15**; yearbook $22 by Dec 1 |
| `03-en-lunch-letter.png` | English | Meal application by **Oct 15**; pay **−$14.50** balance by **Oct 1** |
| `04-es-carta-escolar.png` | Spanish | Tdap vaccine record by **Oct 9** (deadline); sign emergency card (signature); Science Night **Oct 22 5:30pm**, RSVP by Oct 16; optional **$8** lab fee |
| `05-vi-thong-bao.png` | Vietnamese | Reading Day **Sep 25**; parent meeting **Oct 6 6:00pm**, reply by **Oct 1** (needs_reply + signature); after-school **$45/mo** apply by **Oct 5** |
| `06-zh-tongzhi.png` | Chinese | Museum trip **Oct 9**, **$10** + signed form by **Sep 30**; parent meeting **Oct 14 6:30pm**, RSVP by Oct 9; yearbook $22 by Dec 1 |
| `07-en-sports-flyer.png` | English | Basketball registration by **Oct 23**, **$65**; parent meeting **Nov 5 7pm**; signed waiver |

Good demo stack: `01` + `02` + `03` in Vietnamese → ~4–6 items, one reply draft.
Cross-language check: upload `04` (Spanish) with target `en` — an English-speaking parent should get English items with the Spanish source quotes.

Regenerate: the HTML sources live in the session scratchpad; the layout is plain HTML + headless Chrome `--screenshot`, ~10 lines each.
