// tests/shipped-seats.js
// The one place a test reads the shipped seats.json. Tests that need the shipped seats import it
// from here, so the seat drill (tests/seat-drill.test.js) can hand them other models through
// GOVERNANCE_SEATS_PATH and prove a seats-only change needs no test change. A test that pins a
// model ID uses its own fixture instead.
'use strict';

const fs = require('fs');
const path = require('path');

const SHIPPED_SEATS_PATH =
  process.env.GOVERNANCE_SEATS_PATH || path.join(__dirname, '..', 'seats.json');
const SHIPPED_SEATS = JSON.parse(fs.readFileSync(SHIPPED_SEATS_PATH, 'utf8'));

module.exports = { SHIPPED_SEATS };
