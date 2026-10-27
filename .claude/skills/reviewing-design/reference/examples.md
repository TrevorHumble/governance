# Design pairs

Each pair: the shape to flag, then a nearby shape that is not a finding.

## Shallow module

Flag: `new DateFormatter({ locale, pad, sep })` with a getter and setter per option, used once to print one date. The interface is as large as the one-line job. Hide the choices; expose `formatDate(d)`.

Not a finding: a function with many parameters that carry data only the caller has, such as a source path.

## Pass-through

Flag: `getTask(id) { return repo.getTask(id) }` for every method of the repo. Delete it and callers lose nothing.

Not a finding: a wrapper that turns "undefined" into a thrown NotFound, narrows a type, or is the single place a policy will live and says so.

## Information leakage

Flag: the screen splits the cache line on `|` although the store owns that format. If the store changes the format, the screen breaks.

Not a finding: two modules importing the same config. Config is meant to be shared; leakage is a storage format or rule reappearing outside its owner.

## Ghost gate

Flag: `validateOrder(o)` runs in `placeOrder` and its result is dropped, so nothing is ever refused. Tests call only `validateOrder`.

Not a finding: a guard that has recorded instances of the failure, or a dated trigger. Look for one before you raise this; "I did not find one" without looking is not evidence.

## Comment

Flag: `// subtract the discount from the total` above `total -= discount`. It repeats the code.

Not a finding: `// amounts are in cents, so never use floats` above a constant. It gives a reason the code cannot, so praise it.

## A clean change

A 15-line `retry(fn, times)` with a comment on why the delay doubles, and tests for success and for giving up. Small interface, hidden work, nothing to flag: `praise:` and stop.
