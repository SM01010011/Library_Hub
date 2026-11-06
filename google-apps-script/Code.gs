/**
 * =====================================================================
 *  LIBRARY HUB – Google Apps Script backend  (Code.gs)
 * =====================================================================
 *  This file runs on Google's servers, NOT in the browser.
 *  It is the "middle man" between the website and the Google Sheet.
 *
 *  How it works
 *    Website (booking form)  --POST-->  doPost()  -->  saves a row in the Sheet
 *    Website (admin page)    --GET--->  doGet()   -->  reads rows from the Sheet
 *
 *  Before using it:
 *    1. Paste your Google Sheet ID into SHEET_ID below.
 *    2. Run the function  setupSheets  once (creates the 3 tabs + headings).
 *    3. Deploy as a Web App  (see README.txt, Step 3).
 *
 *  Safety rules this script follows
 *    - The Sheet ID stays here, never in the website code.
 *    - POST can only write bookings/messages.  GET can only read.
 *    - Every value is checked again on the server (browser checks can be bypassed).
 *    - Values are saved as plain TEXT so "=1+1" can never run as a formula.
 *    - LockService makes sure two people cannot take the same seat at once.
 */

// ---------------------------------------------------------------------
// 1. SETTINGS  (the only line you must edit)
// ---------------------------------------------------------------------

// Open your Google Sheet. The ID is the long text in the address bar:
// https://docs.google.com/spreadsheets/d/  THIS_PART_IS_THE_ID  /edit
var SHEET_ID = 'PASTE_YOUR_GOOGLE_SHEET_ID_HERE';

// Names of the tabs (sheets) inside the spreadsheet
var TAB_BOOKINGS = 'Bookings';
var TAB_CONTACTS = 'Contacts';
var TAB_MEMBERSHIPS = 'Memberships';

// Each column = [heading shown in the Sheet, key name used in the code].
// The ORDER here is the order of the columns in the Sheet.
var BOOKING_COLUMNS = [
  ['Booking ID', 'bookingId'], ['Name', 'name'], ['Registration Number', 'regNo'],
  ['Email', 'email'], ['Phone', 'phone'], ['Department', 'department'],
  ['Year', 'year'], ['Booking Date', 'bookingDate'], ['Time Slot', 'timeSlot'],
  ['Number of People', 'people'], ['Seat Number', 'seat'], ['Notes', 'notes'],
  ['Submission Date', 'submittedAt']
];
var CONTACT_COLUMNS = [
  ['Message ID', 'messageId'], ['Name', 'name'], ['Email', 'email'],
  ['Phone', 'phone'], ['Subject', 'subject'], ['Message', 'message'],
  ['Submission Date', 'submittedAt']
];
var MEMBERSHIP_COLUMNS = [
  ['Membership ID', 'membershipId'], ['Name', 'name'], ['Registration Number', 'regNo'],
  ['Email', 'email'], ['Membership Type', 'type'], ['Start Date', 'startDate'],
  ['Expiry Date', 'expiryDate'], ['Status', 'status']
];

// Allowed values (must match the options in booking.html)
var ALLOWED_SLOTS = ['09:00 – 11:00', '11:00 – 13:00', '14:00 – 16:00', '16:00 – 18:00'];
var ALLOWED_YEARS = ['1st year', '2nd year', '3rd year', '4th year', 'Master’s', 'Research scholar'];
var ALLOWED_SEATS = buildSeatList();
var SATURDAY_BLOCKED_SLOT = '16:00 – 18:00';   // library closes at 17:00 on Saturdays

// Seats S1..S12 (silent zone) and G1..G12 (group zone)
function buildSeatList() {
  var seats = [];
  for (var i = 1; i <= 12; i++) seats.push('S' + i);
  for (var j = 1; j <= 12; j++) seats.push('G' + j);
  return seats;
}

// ---------------------------------------------------------------------
// 2. ENTRY POINTS  (Google calls these automatically)
// ---------------------------------------------------------------------

/**
 * doPost – receives data SENT by the website (booking or contact form).
 * The website sends JSON text, for example: {"action":"submitBooking", ...}
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ success: false, message: 'Empty request.' });
    }
    if (e.postData.contents.length > 20000) {
      return jsonResponse({ success: false, message: 'Request is too large.' });
    }

    var data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseError) {
      return jsonResponse({ success: false, message: 'Invalid request format.' });
    }

    if (data.action === 'submitBooking') return jsonResponse(submitBooking(data));
    if (data.action === 'submitContact') return jsonResponse(submitContact(data));

    return jsonResponse({ success: false, message: 'Unknown action.' });
  } catch (error) {
    Logger.log('doPost error: ' + error);     // details stay in the Apps Script log
    return jsonResponse({ success: false, message: 'Server error. Please try again later.' });
  }
}

/**
 * doGet – lets the website READ data. It never changes anything.
 *   ?action=availability&date=2026-11-20&slot=09:00 – 11:00   -> seats already taken
 *   ?action=all          -> bookings + contacts + memberships (admin dashboard)
 *   ?action=bookings | contacts | memberships
 */
function doGet(e) {
  try {
    var params = (e && e.parameter) ? e.parameter : {};
    var action = params.action || '';

    if (action === 'availability') return jsonResponse(getAvailability(params.date, params.slot));
    if (action === 'bookings') return jsonResponse({ success: true, bookings: getBookings() });
    if (action === 'contacts') return jsonResponse({ success: true, contacts: getContacts() });
    if (action === 'memberships') return jsonResponse({ success: true, memberships: getMemberships() });
    if (action === 'all') {
      return jsonResponse({
        success: true,
        bookings: getBookings(),
        contacts: getContacts(),
        memberships: getMemberships(),
        loadedAt: nowText()
      });
    }

    return jsonResponse({ success: true, message: 'Library Hub API is running.' });
  } catch (error) {
    Logger.log('doGet error: ' + error);
    return jsonResponse({ success: false, message: 'Server error. Please try again later.' });
  }
}

// ---------------------------------------------------------------------
// 3. BOOKINGS
// ---------------------------------------------------------------------

/**
 * submitBooking – validate, check the seat is free, then save.
 * Returns an object like { success: true, booking: {...} } or { success: false, message: '...' }
 */
function submitBooking(data) {
  // Spam trap: real visitors never fill this hidden field
  if (data.website) return { success: false, message: 'Request rejected.' };

  // 1) Check every field
  var errors = validateBooking(data);
  if (Object.keys(errors).length > 0) {
    return { success: false, code: 'VALIDATION', message: 'Please correct the highlighted fields.', errors: errors };
  }

  // 2) Clean the values (trim, limit length, make them formula-safe)
  var record = {
    name: cleanText(data.name, 60),
    regNo: cleanText(data.regNo, 8),
    email: cleanText(String(data.email).toLowerCase(), 80),
    phone: cleanText(data.phone, 10),
    department: cleanText(data.department, 60),
    year: cleanText(data.year, 30),
    bookingDate: cleanText(data.bookingDate, 10),
    timeSlot: cleanText(data.timeSlot, 20),
    people: String(parseInt(data.people, 10)),
    seat: cleanText(data.seat, 4),
    notes: cleanText(data.notes, 300, true),
    submittedAt: nowText()
  };

  // 3) LOCK: only one booking at a time may run the "check + save" steps below.
  //    Without the lock, two people could both see seat S1 as free and both save it.
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);                 // wait up to 15 seconds for our turn
  } catch (lockError) {
    return { success: false, code: 'BUSY', message: 'The system is busy. Please try again in a few seconds.' };
  }

  try {
    // 4) Check the seat is still free (inside the lock, so the answer is reliable)
    var takenSeats = getBookedSeats(record.bookingDate, record.timeSlot);
    if (takenSeats.indexOf(record.seat) !== -1) {
      return {
        success: false,
        code: 'SEAT_TAKEN',
        message: 'Seat ' + record.seat + ' was just booked by someone else for this date and time slot. Please choose another seat.',
        bookedSeats: takenSeats
      };
    }

    // 5) Create a unique booking ID and save the row
    var existingIds = readRows(TAB_BOOKINGS, BOOKING_COLUMNS).map(function (row) { return row.bookingId; });
    record.bookingId = makeUniqueId('BK', existingIds);

    appendRecord(TAB_BOOKINGS, BOOKING_COLUMNS, record);
    SpreadsheetApp.flush();               // make sure the row is really written before unlocking

    return {
      success: true,
      message: 'Booking saved.',
      booking: {
        bookingId: record.bookingId,
        name: record.name,
        bookingDate: record.bookingDate,
        timeSlot: record.timeSlot,
        seat: record.seat,
        people: record.people
      }
    };
  } finally {
    lock.releaseLock();                   // always let the next person in
  }
}

/**
 * validateBooking – returns an object of errors, e.g. { email: 'Enter a valid email.' }
 * An empty object means everything is valid.
 */
function validateBooking(data) {
  var errors = {};
  var name = String(data.name || '').trim();
  var regNo = String(data.regNo || '').trim();
  var email = String(data.email || '').trim();
  var phone = String(data.phone || '').trim();
  var department = String(data.department || '').trim();
  var people = Number(data.people);

  if (name.length < 3 || name.length > 60) errors.name = 'Enter your full name (3 to 60 characters).';
  if (!/^[0-9]{8}$/.test(regNo)) errors.regNo = 'Registration number must be exactly 8 digits.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 80) errors.email = 'Enter a valid email address.';
  if (!/^[6-9][0-9]{9}$/.test(phone)) errors.phone = 'Enter a valid 10-digit mobile number.';
  if (department.length < 2 || department.length > 60) errors.department = 'Enter your department.';
  if (ALLOWED_YEARS.indexOf(data.year) === -1) errors.year = 'Choose your year of study.';
  if (ALLOWED_SLOTS.indexOf(data.timeSlot) === -1) errors.timeSlot = 'Choose a time slot.';
  if (ALLOWED_SEATS.indexOf(data.seat) === -1) errors.seat = 'Choose a seat from the seat map.';
  if (!(people >= 1 && people <= 6) || people % 1 !== 0) errors.people = 'Number of people must be between 1 and 6.';
  if (String(data.notes || '').length > 300) errors.notes = 'Notes can be at most 300 characters.';

  // Date checks
  var dateText = String(data.bookingDate || '');
  if (!isRealDate(dateText)) {
    errors.bookingDate = 'Choose a valid booking date.';
  } else if (dateText < todayText()) {
    errors.bookingDate = 'The booking date cannot be in the past.';
  } else {
    var dayOfWeek = dayOfWeekOf(dateText);            // 0 = Sunday ... 6 = Saturday
    if (dayOfWeek === 0) {
      errors.bookingDate = 'The library is closed on Sundays.';
    } else if (dayOfWeek === 6 && data.timeSlot === SATURDAY_BLOCKED_SLOT) {
      errors.timeSlot = 'The library closes at 17:00 on Saturdays. Choose an earlier slot.';
    }
  }
  return errors;
}

/** getAvailability – which seats are already booked for a date and slot? */
function getAvailability(date, slot) {
  if (!isRealDate(String(date || '')) || ALLOWED_SLOTS.indexOf(slot) === -1) {
    return { success: false, message: 'Invalid date or time slot.' };
  }
  // Only seat codes are returned – no personal details.
  return { success: true, date: date, slot: slot, bookedSeats: getBookedSeats(date, slot) };
}

/** getBookedSeats – list of seat numbers already booked for this date + slot */
function getBookedSeats(date, slot) {
  var seats = [];
  readRows(TAB_BOOKINGS, BOOKING_COLUMNS).forEach(function (row) {
    if (row.bookingDate === date && row.timeSlot === slot) seats.push(row.seat);
  });
  return seats;
}

/** getBookings – all booking rows (newest first) for the admin dashboard */
function getBookings() {
  return readRows(TAB_BOOKINGS, BOOKING_COLUMNS).reverse();
}

// ---------------------------------------------------------------------
// 4. CONTACT MESSAGES
// ---------------------------------------------------------------------

function submitContact(data) {
  if (data.website) return { success: false, message: 'Request rejected.' };   // spam trap

  var errors = validateContact(data);
  if (Object.keys(errors).length > 0) {
    return { success: false, code: 'VALIDATION', message: 'Please correct the highlighted fields.', errors: errors };
  }

  var record = {
    name: cleanText(data.name, 60),
    email: cleanText(String(data.email).toLowerCase(), 80),
    phone: cleanText(data.phone, 10),
    subject: cleanText(data.subject, 100),
    message: cleanText(data.message, 1000, true),
    submittedAt: nowText()
  };

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (lockError) {
    return { success: false, code: 'BUSY', message: 'The system is busy. Please try again in a few seconds.' };
  }

  try {
    var existingIds = readRows(TAB_CONTACTS, CONTACT_COLUMNS).map(function (row) { return row.messageId; });
    record.messageId = makeUniqueId('MSG', existingIds);
    appendRecord(TAB_CONTACTS, CONTACT_COLUMNS, record);
    SpreadsheetApp.flush();
    return { success: true, message: 'Message saved.', messageId: record.messageId };
  } finally {
    lock.releaseLock();
  }
}

function validateContact(data) {
  var errors = {};
  var name = String(data.name || '').trim();
  var email = String(data.email || '').trim();
  var phone = String(data.phone || '').trim();
  var subject = String(data.subject || '').trim();
  var message = String(data.message || '').trim();

  if (name.length < 3 || name.length > 60) errors.name = 'Enter your name (3 to 60 characters).';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 80) errors.email = 'Enter a valid email address.';
  if (phone !== '' && !/^[6-9][0-9]{9}$/.test(phone)) errors.phone = 'Enter a valid 10-digit mobile number or leave it empty.';
  if (subject.length < 3 || subject.length > 100) errors.subject = 'Enter a subject (3 to 100 characters).';
  if (message.length < 10 || message.length > 1000) errors.message = 'Message must be 10 to 1000 characters.';
  return errors;
}

/** getContacts – all contact messages (newest first) for the admin dashboard */
function getContacts() {
  return readRows(TAB_CONTACTS, CONTACT_COLUMNS).reverse();
}

// ---------------------------------------------------------------------
// 5. MEMBERSHIPS  (rows are typed into the Sheet by hand)
// ---------------------------------------------------------------------

function getMemberships() {
  return readRows(TAB_MEMBERSHIPS, MEMBERSHIP_COLUMNS);
}

// ---------------------------------------------------------------------
// 6. SPREADSHEET HELPERS
// ---------------------------------------------------------------------

/** Opens one tab of the spreadsheet. The ID is only used here, on the server. */
function getTab(tabName) {
  var tab = SpreadsheetApp.openById(SHEET_ID).getSheetByName(tabName);
  if (!tab) throw new Error('Tab not found: ' + tabName + '. Run setupSheets() first.');
  return tab;
}

/**
 * readRows – reads a tab and returns a list of objects, e.g.
 *   [ { bookingId: 'BK-...', name: 'Aarav', ... }, ... ]
 * getDisplayValues() returns everything as text, which keeps dates simple.
 */
function readRows(tabName, columns) {
  var tab = getTab(tabName);
  var lastRow = tab.getLastRow();
  if (lastRow < 2) return [];                                   // only the heading row exists

  var values = tab.getRange(2, 1, lastRow - 1, columns.length).getDisplayValues();
  var rows = [];
  values.forEach(function (line) {
    if (line.join('') === '') return;                           // skip empty rows
    var row = {};
    columns.forEach(function (column, index) { row[column[1]] = line[index]; });
    rows.push(row);
  });
  return rows;
}

/**
 * appendRecord – adds one row at the bottom.
 * The cells are first set to "Plain text" format so Google Sheets never
 * turns a value into a formula, number or date.
 */
function appendRecord(tabName, columns, record) {
  var tab = getTab(tabName);
  var newRowNumber = tab.getLastRow() + 1;
  var rowValues = columns.map(function (column) { return record[column[1]] === undefined ? '' : record[column[1]]; });

  var range = tab.getRange(newRowNumber, 1, 1, columns.length);
  range.setNumberFormat('@');                                    // '@' means plain text
  range.setValues([rowValues]);
}

/** Creates IDs such as BK-20261120-3F9A2C that are not already used */
function makeUniqueId(prefix, existingIds) {
  var datePart = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
  var id;
  do {
    id = prefix + '-' + datePart + '-' + Utilities.getUuid().replace(/-/g, '').substring(0, 6).toUpperCase();
  } while (existingIds.indexOf(id) !== -1);
  return id;
}

// ---------------------------------------------------------------------
// 7. SMALL UTILITIES
// ---------------------------------------------------------------------

/**
 * cleanText – makes a submitted value safe to store.
 *  - removes hidden control characters
 *  - trims spaces and limits the length
 *  - FORMULA INJECTION GUARD: a value starting with = + - or @ could be run as a
 *    formula if someone opens the Sheet/CSV in Excel, so we put a ' in front.
 */
function cleanText(value, maxLength, allowNewLines) {
  var text = String(value === null || value === undefined ? '' : value);
  text = allowNewLines
    ? text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    : text.replace(/[\u0000-\u001F\u007F]/g, ' ');
  text = text.trim().substring(0, maxLength);
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  return text;
}

/** Sends a JavaScript object back to the website as JSON text */
function jsonResponse(object) {
  return ContentService.createTextOutput(JSON.stringify(object))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Current date and time as text, in the script's time zone */
function nowText() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}
function todayText() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/** True if text looks like 2026-11-20 AND is a real calendar date */
function isRealDate(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  var parts = text.split('-');
  var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return date.getFullYear() === Number(parts[0]) &&
         date.getMonth() === Number(parts[1]) - 1 &&
         date.getDate() === Number(parts[2]);
}

/** 0 = Sunday ... 6 = Saturday */
function dayOfWeekOf(text) {
  var parts = text.split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).getDay();
}

// ---------------------------------------------------------------------
// 8. ONE-TIME SETUP  (run this once from the Apps Script editor)
// ---------------------------------------------------------------------

/**
 * setupSheets – creates the three tabs with their headings.
 * Safe to run again: it never deletes your data.
 */
function setupSheets() {
  var spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  prepareTab(spreadsheet, TAB_BOOKINGS, BOOKING_COLUMNS);
  prepareTab(spreadsheet, TAB_CONTACTS, CONTACT_COLUMNS);
  prepareTab(spreadsheet, TAB_MEMBERSHIPS, MEMBERSHIP_COLUMNS);
  Logger.log('Done! The tabs Bookings, Contacts and Memberships are ready.');
}

function prepareTab(spreadsheet, tabName, columns) {
  var tab = spreadsheet.getSheetByName(tabName) || spreadsheet.insertSheet(tabName);
  var headings = columns.map(function (column) { return column[0]; });

  // Whole sheet = plain text, so typed dates such as 2026-11-20 stay exactly as typed
  tab.getRange(1, 1, tab.getMaxRows(), columns.length).setNumberFormat('@');

  // Heading row
  tab.getRange(1, 1, 1, columns.length).setValues([headings])
     .setFontWeight('bold').setBackground('#6d4aff').setFontColor('#ffffff');
  tab.setFrozenRows(1);
  tab.setColumnWidths(1, columns.length, 150);
}
