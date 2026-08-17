# Design Philosophy: Worked Examples

**As the reviewer applying `standards/design-philosophy.md`, I need one worked Flag/Clean pair per red flag, so that I match findings to real patterns instead of over-flagging style or missing genuine defects.**

Each section: a `Flag` block (a **counter-design** in this repo's idiom, the shape the repo avoids; its file and column names are illustrative), a `Clean` block (the corrected shape, illustrative), and a `Not a finding:` guard naming a nearby pattern that does NOT qualify.

---

### shallow module

Flag: the interface is as complex as what it hides; every internal knob is a parameter:

```js
function saveOutput(srcPath, dstDir, width, height, fit, quality, format) {
  return resizeLib(srcPath)
    .resize(width, height, { fit })
    .toFormat(format, { quality })
    .toFile(path.join(dstDir, path.basename(srcPath)));
}
```

Clean: one decision the caller cares about; the sizing policy lives inside (a generic module shape: `makeThumbnail(originalPath)` in a media-processing module, whose `OUTPUT_WIDTH` and `OUTPUT_QUALITY` are module-private constants and only the directory comes from config):

```js
// Sizing policy is this module's decision: callers say what, not how.
const OUTPUT_WIDTH = 400;
const OUTPUT_QUALITY = 78;
function makeThumbnail(originalPath) {
  const absOutput = path.join(OUTPUT_DIR, path.basename(originalPath) + '.jpg');
  return resizeLib(originalPath)
    .resize({ width: OUTPUT_WIDTH, withoutEnlargement: true })
    .toFormat('jpeg', { quality: OUTPUT_QUALITY })
    .toFile(absOutput);
}
```

Not a finding: a function with several parameters is not automatically shallow, flag it only when the parameters re-expose decisions the module exists to own (sizing policy above), not when they carry genuinely caller-owned data (the source path).

---

### information leakage

Flag: duplicated ownership of a formula, filter, or status rule: a hypothetical counter-design where two routes each re-derive the "visible order" rule instead of asking the module that owns it:

```js
// hypothetical routeA.js
const rows = db.prepare('SELECT * FROM orders WHERE cancelled = 0 AND customer_id = ?').all(id);
// hypothetical routeB.js: the same visibility decision, re-stated and free to drift
const rows = db
  .prepare('SELECT * FROM orders WHERE cancelled = 0 AND product_id = ?')
  .all(productId);
```

Clean: a shape where the visibility rule (`cancelled = 0`) is applied inside one owning service, and callers consume the computed result, never the rule:

```js
// src/services/orders.js owns "visible"; callers consume computed result sets
// from its registry (ACTIVE_ORDERS: code -> () => Set<customerId>).
const activeOrders = ACTIVE_ORDERS[code]();
```

Not a finding: two modules both importing a shared config module is not leakage, config is the sanctioned shared surface. Leakage requires an _internal representation decision_ (storage format, encoding, a filter rule like visibility) reappearing outside its owner.

---

### temporal decomposition

Flag: modules named for when they run, so one format decision smears across all three:

```js
// step1-load.js, step2-transform.js, step3-write.js
// step2 must know step1 returned CSV rows; step3 must know step2 kept the header row.
```

Clean: modules named for what they hide; order of operations is an implementation detail:

```js
// record-import.js: owns the file format end to end
function importRecords(csvPath) {
  /* parse, normalize, insert; format never escapes */
}
```

Not a finding: a pipeline that genuinely IS sequential (parse to transform to write) may be written as ordered steps inside one module; the flag is structure that forces _knowledge_ of one step's internals into another module, not the mere existence of an order.

---

### pass-through

Flag: a layer that renames the layer below and adds nothing:

```js
function getRecord(id) {
  return db.getRecordById(id);
}
```

Clean: the layer earns its place by changing the abstraction (error contract, shape, policy):

```js
// Returns a record or throws (NotFound is an illustrative error type);
// callers never see undefined.
function requireRecord(id) {
  const r = db.getRecordById(id);
  if (!r) throw new NotFound(`No record with id ${id}`);
  return r;
}
```

Not a finding: a thin wrapper that fixes an argument, narrows a type, or exists to be the single future seam for a policy (and says so) adds abstraction; the flag is forwarding with a new name and nothing else.

---

### vague name

Flag: the name forces the reader to trace the data flow to learn what it holds:

```js
const data = getData(req);
const tmp = process(data);
res.json(tmp);
```

Clean: the names state what the things are:

```js
const uploadMeta = parseUploadFields(req);
const savedUpload = storeUpload(uploadMeta);
res.json(savedUpload);
```

Not a finding: a short name with a one-line scope and an obvious source (`for (const row of rows)`) is fine, the flag is genericness that survives past the point a reader needs to know the meaning, not brevity itself.

---

### redundant encoding

Flag: one fact, a user's completed-step count, rendered three simultaneous ways (count text, a
progress bar sized off the same number, and an explainer paragraph restating what the bar already
shows). The three-way shape the flag names:

```html
<p class="steps-count">{{completedCount}} of {{totalCount}} steps done</p>
<div class="progress-bar" style="width: {{progressPercent}}%"></div>
<p class="steps-explainer">
  As you complete steps, the bar above fills in to show how close you are to finishing all
  {{totalCount}} steps. You've completed {{completedCount}} of them so far.
</p>
```

Clean: the count text alone; it is the fact, stated once:

```html
<p class="steps-count">{{completedCount}} of {{totalCount}} steps done</p>
```

Not a finding: a progress bar that is the value's only visual representation on the surface, whose
accessible name announces the value to assistive technology, with no separate count text anywhere on
the page:

```html
<div
  class="progress-bar"
  role="progressbar"
  aria-valuenow="{{completedCount}}"
  aria-valuemax="{{totalCount}}"
  aria-label="{{completedCount}} of {{totalCount}} steps done"
  style="width: {{progressPercent}}%"
></div>
```

or an icon paired with color for the same state (a green checkmark beside a green "done" label,
where the color alone would fail colorblind users). The guard excuses the bar only when the bar
is the sole representation: pair that same bar with the count text above, as the Flag block does,
and it is back in Flag territory; an accessible name never excuses a second representation that
sits beside visible text already showing the same value.
