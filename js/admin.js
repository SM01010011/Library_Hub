


var records = { bookings: [], contacts: [], memberships: [] };
var isLoading = false;

var loadAlert = document.getElementById("load-alert");
var refreshButton = document.getElementById("refresh-btn");


var tabs = document.querySelectorAll(".tab");
var panels = document.querySelectorAll(".panel");

function showTab(tabName) {
  tabs.forEach(function (tab) {
    tab.setAttribute("aria-selected", tab.dataset.tab === tabName ? "true" : "false");
  });
  panels.forEach(function (panel) {
    panel.classList.toggle("active", panel.id === "panel-" + tabName);
  });
}
tabs.forEach(function (tab) {
  tab.addEventListener("click", function () { showTab(tab.dataset.tab); });
});


async function loadData() {
  if (isLoading) return;                       
  isLoading = true;
  setButtonLoading(refreshButton, true, "Loading…");
  hideAlert(loadAlert);
  try {
    var result = await getFromScript({ action: "all" });
    if (!result.success) throw new Error(result.message || "Could not load records.");

    records.bookings = result.bookings || [];
    records.contacts = result.contacts || [];
    records.memberships = result.memberships || [];
    document.querySelectorAll(".loaded-at").forEach(function (el) {
      el.textContent = "Updated " + new Date().toLocaleTimeString();
    });
    renderAll();
  } catch (error) {
    showAlert(loadAlert, "error", error.message);
    renderAll();                               
  } finally {
    isLoading = false;
    setButtonLoading(refreshButton, false);
  }
}


function renderAll() {
  renderOverview();
  renderBookings();
  renderContacts();
  renderMemberships();
}


function countMembers(type) {
  return records.memberships.filter(function (row) {
    return row.type.trim().toLowerCase() === type;
  });
}
function countActive(rows) {
  return rows.filter(function (row) { return row.status.trim().toLowerCase() === "active"; }).length;
}

function renderOverview() {
  var students = countMembers("student");
  var faculty = countMembers("faculty");
  var guests = countMembers("guest");

  document.getElementById("stat-bookings").textContent = records.bookings.length;
  document.getElementById("stat-contacts").textContent = records.contacts.length;
  document.getElementById("stat-students").textContent = students.length;
  document.getElementById("stat-faculty").textContent = faculty.length;
  document.getElementById("stat-guests").textContent = guests.length;
  document.getElementById("sub-students").textContent = countActive(students) + " active";
  document.getElementById("sub-faculty").textContent = countActive(faculty) + " active";
  document.getElementById("sub-guests").textContent = countActive(guests) + " active";
}


function buildRows(rows, columns, emptyMessage) {
  if (rows.length === 0) {
    return '<tr><td class="empty" colspan="' + columns.length + '">' + escapeHtml(emptyMessage) + "</td></tr>";
  }
  return rows.map(function (row) {
    var cells = columns.map(function (column) {
      var text = escapeHtml(row[column[0]]);                  
      var cssClass = "";
      if (column[0] === "message") cssClass = ' class="msg-cell"';
      if (["bookingId", "bookingDate", "timeSlot", "phone", "messageId", "membershipId", "submittedAt", "startDate", "expiryDate"].indexOf(column[0]) !== -1) cssClass = ' class="nowrap"';
      if (column[0] === "status") {
        text = '<span class="status-pill ' + escapeHtml(row.status.toLowerCase()) + '">' + text + "</span>";
      }
      return "<td" + cssClass + ' data-label="' + escapeHtml(column[1]) + '">' + text + "</td>";
    });
    return "<tr>" + cells.join("") + "</tr>";
  }).join("");
}


var bookingColumns = [
  ["bookingId", "Booking ID"], ["name", "Student name"], ["regNo", "Registration no."],
  ["email", "Email"], ["phone", "Phone"], ["department", "Department"],
  ["bookingDate", "Date"], ["timeSlot", "Time slot"], ["seat", "Seat"], ["people", "People"]
];

function renderBookings() {
  var nameSearch = document.getElementById("b-name").value.trim().toLowerCase();
  var regSearch = document.getElementById("b-reg").value.trim().toLowerCase();
  var dateFilter = document.getElementById("b-date").value;           

  var shown = records.bookings.filter(function (row) {
    return row.name.toLowerCase().indexOf(nameSearch) !== -1 &&
           row.regNo.toLowerCase().indexOf(regSearch) !== -1 &&
           (dateFilter === "" || row.bookingDate === dateFilter);
  });

  document.getElementById("b-body").innerHTML = buildRows(shown, bookingColumns, "No booking records found.");
  document.getElementById("b-count").textContent =
    "Showing " + shown.length + " of " + records.bookings.length + " bookings";
}


var contactColumns = [
  ["messageId", "Message ID"], ["name", "Name"], ["email", "Email"], ["phone", "Phone"],
  ["subject", "Subject"], ["message", "Message"], ["submittedAt", "Submitted"]
];

function renderContacts() {
  var search = document.getElementById("c-search").value.trim().toLowerCase();
  var shown = records.contacts.filter(function (row) {
    return row.name.toLowerCase().indexOf(search) !== -1 || row.email.toLowerCase().indexOf(search) !== -1;
  });
  document.getElementById("c-body").innerHTML = buildRows(shown, contactColumns, "No contact messages found.");
  document.getElementById("c-count").textContent =
    "Showing " + shown.length + " of " + records.contacts.length + " messages";
}


var membershipColumns = [
  ["membershipId", "Membership ID"], ["name", "Name"], ["regNo", "Registration no."],
  ["email", "Email"], ["type", "Type"], ["startDate", "Start date"],
  ["expiryDate", "Expiry date"], ["status", "Status"]
];

function renderMemberships() {
  document.getElementById("m-body").innerHTML =
    buildRows(records.memberships, membershipColumns, "No membership records yet. Add rows in the Memberships tab of your Google Sheet.");
  document.getElementById("m-count").textContent = records.memberships.length + " membership records";
}


["b-name", "b-reg", "b-date"].forEach(function (id) {
  document.getElementById(id).addEventListener("input", renderBookings);
});
document.getElementById("c-search").addEventListener("input", renderContacts);
document.getElementById("b-clear").addEventListener("click", function () {
  document.getElementById("b-name").value = "";
  document.getElementById("b-reg").value = "";
  document.getElementById("b-date").value = "";
  renderBookings();
});




function toCsvCell(value) {
  var text = String(value == null ? "" : value);
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

// columns = [[key, "Heading"], ...]
function downloadCsv(fileName, columns, rows) {
  var lines = [columns.map(function (c) { return toCsvCell(c[1]); }).join(",")];
  rows.forEach(function (row) {
    lines.push(columns.map(function (c) { return toCsvCell(row[c[0]]); }).join(","));
  });

  // "\uFEFF" is the UTF-8 BOM: it tells Microsoft Excel the file is UTF-8,
  // so accents and symbols such as the rupee sign display correctly.
  var csvText = "\uFEFF" + lines.join("\r\n");
  var blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });

  var link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
}

// Export columns: every field saved in the Sheet
var bookingCsvColumns = [
  ["bookingId", "Booking ID"], ["name", "Name"], ["regNo", "Registration Number"], ["email", "Email"],
  ["phone", "Phone"], ["department", "Department"], ["year", "Year"], ["bookingDate", "Booking Date"],
  ["timeSlot", "Time Slot"], ["people", "Number of People"], ["seat", "Seat Number"],
  ["notes", "Notes"], ["submittedAt", "Submission Date"]
];

document.getElementById("dl-bookings").addEventListener("click", function () {
  downloadCsv("library_bookings.csv", bookingCsvColumns, records.bookings);
});
var contactCsvColumns = [
  ["messageId", "Message ID"], ["name", "Name"], ["email", "Email"], ["phone", "Phone"],
  ["subject", "Subject"], ["message", "Message"], ["submittedAt", "Submission Date"]
];
var membershipCsvColumns = [
  ["membershipId", "Membership ID"], ["name", "Name"], ["regNo", "Registration Number"],
  ["email", "Email"], ["type", "Membership Type"], ["startDate", "Start Date"],
  ["expiryDate", "Expiry Date"], ["status", "Status"]
];

document.getElementById("dl-contacts").addEventListener("click", function () {
  downloadCsv("library_contacts.csv", contactCsvColumns, records.contacts);
});
document.getElementById("dl-memberships").addEventListener("click", function () {
  downloadCsv("library_memberships.csv", membershipCsvColumns, records.memberships);
});

/* ---------- 6. Start ---------- */
refreshButton.addEventListener("click", loadData);
if (!isScriptConfigured()) {
  showAlert(loadAlert, "info", NOT_CONFIGURED_MESSAGE);
  renderAll();
} else {
  loadData();
}
