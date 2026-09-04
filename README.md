# RealCost

Prices, in hours of your life.

Enter your real annual salary and every item in the catalog becomes the working time it takes to earn. A coffee becomes 13 minutes. A phone becomes a week and a half. The salary summary shows what your whole working year buys in any unit you pick: 8,775 coffees, 893 tanks of gas, 29 months of rent, drawn one dot per unit. Around it sit four more views: everything you earn inside a single working day, the full catalog spread from minutes to months on a log scale, a donut of what buying one of everything costs by category, and a curve of what one hour is worth as the workweek changes.

Everything runs in your browser. The salary is used for arithmetic on the page and is never transmitted, stored on a server, or measured by analytics. There are no third-party requests of any kind; a Content-Security-Policy meta tag enforces same-origin scripts, styles, and fonts.

## Run it locally

ES modules and `fetch` need HTTP, so serve the folder instead of opening `index.html` directly:

```bash
python3 -m http.server 4173
```

Then open http://localhost:4173.

## Fork your own

1. Fork this repo.
2. Settings, then Pages, then Source: "Deploy from a branch", branch `main`, folder `/ (root)`.
3. Your copy is live at `https://<you>.github.io/<repo>/`. All asset paths are relative, so no configuration changes are needed for any repo name or custom domain.

## The catalog

Prices live in [data/items.json](data/items.json) and are validated against [data/items.schema.json](data/items.schema.json) in CI. The rules, which are also the contribution policy:

- Every item needs `id`, `name`, `category`, at least one currency in `prices`, a `source` URL, and an `asOf` month.
- Prices are real, cited, and dated. Nothing is invented, estimated, or converted between currencies.
- If an item has no price in the selected currency, it is hidden there rather than guessed at.
- Per-currency `sources` and a `note` are supported for items whose figures come from different pages, and derived figures (the 13-gallon gas tank) must state their arithmetic in the note.
- Duplicate ids fail the build.

Settings such as the default unit chips and dot-field thresholds live in [data/summary.json](data/summary.json).

## Assumptions and math

Hours per week (default 40), working weeks per year (default 48), and gross versus take-home pay (a self-estimated percentage, deliberately not a tax calculator) are all adjustable, and every displayed number follows them:

```
hoursPerYear  = hoursPerWeek x weeksPerYear
effectiveWage = salary x (takeHome ? pct / 100 : 1)
hourlyRate    = effectiveWage / hoursPerYear
timeForItem   = itemPrice / hourlyRate
```

A working day is hoursPerWeek / 5, so "3 days, 4 hrs" always means your days. Settings round-trip through the URL hash for sharing; the salary is included only if you tick the explicitly labeled checkbox.

## Tests

```bash
node --test
```

Covers the calculation and formatting tiers (minutes, hours, days, working years), the acceptance edge cases (one cent items, a salary of 1, 100 hour weeks), the invariant that any unit stacks back to exactly your working year, and full schema validation of the catalog.

## Stack

Plain HTML, CSS, and vanilla ES modules. No framework, no build step, no dependencies. Charts are hand-built SVG with colorblind-validated palettes. Inter (variable, OFL licensed) is self-hosted in [fonts/](fonts/).

## License

MIT. See [LICENSE](LICENSE).
