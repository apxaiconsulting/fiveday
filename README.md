# Fiveday

Paste a task list or the body of an email, let it pull out the action items, split the week across five days, tick things off by hand, and generate an end-of-day report written in the language of an AI Systems & Research Operations role.

Live: https://apxaiconsulting.github.io/fiveday/

## How it works

**Capture.** Paste anything: an email, a Slack message, meeting notes, a bare list. The parser strips greetings, signatures, quoted replies and FYI noise, then scores every remaining line for whether it is actually an action item. Bullets, imperative verbs, "please", "can you", "need to", "action item" all push a line up; questions, pleasantries and all-caps headers push it down. High-confidence lines are pre-ticked, low-confidence ones are hidden behind a checkbox so nothing is silently dropped.

For each candidate it also guesses:

- the **responsibility area**, by keyword match against the areas in Settings
- the **due date**, from phrases like `by Friday`, `EOD`, `tomorrow`, `11/14`, `Nov 14`, `end of month`
- the **priority**, from `urgent` / `ASAP` / `low priority` / `no rush`

Everything is editable before you add it.

**Week.** Five columns, Monday to Friday. Drag tasks between days, drag from the backlog, edit a title in place, tick the checkbox to complete it. `Auto-split backlog` spreads unscheduled work across the remaining days up to your per-day target, never scheduling a task past its due date. `Roll unfinished to today` sweeps anything left behind.

Each open task carries a status you cycle by tapping it: **pending → in progress → proposed**. That is what lets the EOD report tell completed work apart from ongoing projects, proposals and pending items.

**EOD.** Pick a date, fill in the day's numbers (properties researched, qualified leads, mail-ready letters, DIBS leads, errors corrected, systems deployed), and generate. The report groups completed work under the responsibility areas it belongs to, converts task titles to past tense, and keeps completed / ongoing / proposed / pending in separate labelled paragraphs. Blank numbers are left out entirely.

The generator never invents a result. It only restates your tasks, the numbers you typed, and the objectives you ticked. The output box is editable, so you can tighten it before sending.

**Settings.** Role title, organization, objective vocabulary, and the responsibility areas themselves: name, the lead-in phrase that opens that area's paragraph, and the keywords used to route pasted tasks into it. Change these as the role changes and every later report follows.

## Data

Everything is stored in `localStorage` in the browser you use. Nothing is sent anywhere, there is no account and no server. Export and import JSON from Settings to move between browsers or keep a backup.

## Running it locally

```
python3 -m http.server 4178
```

Then open http://localhost:4178.

## Deploying

GitHub Pages serves `main` at the repository root. After changing any of `index.html`, `styles.css`, `app.js`, bump `VERSION` in `sw.js` or the service worker will keep serving the old files from cache.
