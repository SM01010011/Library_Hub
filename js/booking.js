

var form = document.getElementById("booking-form");
var alertBox = document.getElementById("form-alert");
var submitButton = document.getElementById("submit-btn");
var seatStatus = document.getElementById("seat-status");
var dateInput = form.elements.bookingDate;
var slotSelect = form.elements.timeSlot;

var isSubmitting = false;            
var availabilityRequestNumber = 0;   

var SATURDAY_BLOCKED_SLOT = "16:00 – 18:00";   


function buildSeats(containerId, prefix, howMany) {
  var container = document.getElementById(containerId);
  for (var number = 1; number <= howMany; number++) {
    var seatCode = prefix + number;
    var label = document.createElement("label");
    label.className = "seat";
    label.innerHTML = '<input type="radio" name="seat" value="' + seatCode + '"><span>' + seatCode + "</span>";
    container.appendChild(label);
  }
}
buildSeats("silent-seats", "S", 12);
buildSeats("group-seats", "G", 12);

var allSeatInputs = form.querySelectorAll('input[name="seat"]');


dateInput.min = todayAsText();       


function dayOfWeek(dateText) {
  return new Date(dateText + "T00:00:00").getDay();
}


function applyOpeningHoursRules() {
  var chosenDay = dateInput.value ? dayOfWeek(dateInput.value) : -1;
  var lateOption = Array.prototype.find.call(slotSelect.options, function (option) {
    return option.value === SATURDAY_BLOCKED_SLOT;
  });
  lateOption.disabled = (chosenDay === 6);
  if (chosenDay === 6 && slotSelect.value === SATURDAY_BLOCKED_SLOT) slotSelect.value = "";

  if (chosenDay === 0) {
    showFieldError(form, "bookingDate", "The library is closed on Sundays. Please choose another day.");
  } else {
    form.querySelector('.err[data-for="bookingDate"]').textContent = "";
    dateInput.classList.remove("invalid");
  }
}


function enableAllSeats() {
  allSeatInputs.forEach(function (input) { input.disabled = false; });
}

async function refreshSeatAvailability() {
  var date = dateInput.value;
  var slot = slotSelect.value;
  enableAllSeats();

  if (!date || !slot || dayOfWeek(date) === 0) {
    seatStatus.textContent = "Choose a date and time slot to see which seats are free.";
    return;
  }
  if (!isScriptConfigured()) {
    seatStatus.textContent = "Live seat availability is off because js/config.js has no Apps Script URL yet.";
    return;
  }

  var thisRequest = ++availabilityRequestNumber;
  seatStatus.textContent = "Checking free seats…";
  try {
    var data = await getFromScript({ action: "availability", date: date, slot: slot });
    if (thisRequest !== availabilityRequestNumber) return;      
    if (!data.success) throw new Error(data.message || "Could not check seats.");
    markBookedSeats(data.bookedSeats || []);
  } catch (error) {
    if (thisRequest !== availabilityRequestNumber) return;
    seatStatus.textContent = "Could not load seat availability (" + error.message + "). The server will still check when you book.";
  }
}

function markBookedSeats(bookedSeats) {
  allSeatInputs.forEach(function (input) {
    var isBooked = bookedSeats.indexOf(input.value) !== -1;
    input.disabled = isBooked;
    if (isBooked && input.checked) input.checked = false;       
  });
  var freeCount = allSeatInputs.length - bookedSeats.length;
  seatStatus.textContent = freeCount + " of " + allSeatInputs.length + " seats are free for this slot.";
}

dateInput.addEventListener("change", function () { applyOpeningHoursRules(); refreshSeatAvailability(); });
slotSelect.addEventListener("change", refreshSeatAvailability);


function validateForm() {
  clearFieldErrors(form);
  var hasError = false;
  function fail(field, message) { showFieldError(form, field, message); hasError = true; }

  var name = form.elements.name.value.trim();
  var regNo = form.elements.regNo.value.trim();
  var email = form.elements.email.value.trim();
  var phone = form.elements.phone.value.trim();
  var department = form.elements.department.value.trim();

  if (name.length < 3) fail("name", "Enter your full name (at least 3 characters).");
  if (!isValidRegNo(regNo)) fail("regNo", "Registration number must be exactly 8 digits.");
  if (!isValidEmail(email)) fail("email", "Enter a valid email address.");
  if (!isValidPhone(phone)) fail("phone", "Enter a valid 10-digit mobile number.");
  if (department.length < 2) fail("department", "Enter your department.");
  if (!form.elements.year.value) fail("year", "Choose your year of study.");

  if (!dateInput.value) fail("bookingDate", "Choose a booking date.");
  else if (dateInput.value < todayAsText()) fail("bookingDate", "The booking date cannot be in the past.");
  else if (dayOfWeek(dateInput.value) === 0) fail("bookingDate", "The library is closed on Sundays.");

  if (!slotSelect.value) fail("timeSlot", "Choose a time slot.");

  var people = Number(form.elements.people.value);
  if (!(people >= 1 && people <= 6) || people % 1 !== 0) fail("people", "Enter a number from 1 to 6.");

  var chosenSeat = form.querySelector('input[name="seat"]:checked');
  if (!chosenSeat) fail("seat", "Pick a free seat from the seat map.");

  if (!form.elements.agree.checked) fail("agree", "Please confirm that you have read the library rules.");

  if (hasError) {
    var firstError = form.querySelector(".invalid, .err:not(:empty)");
    if (firstError) firstError.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  return !hasError;
}


form.addEventListener("submit", async function (event) {
  event.preventDefault();
  if (isSubmitting) return;                      
  hideAlert(alertBox);
  if (!validateForm()) {
    showAlert(alertBox, "error", "Some details need fixing. Check the fields marked in red.");
    return;
  }

  
  var preferences = Array.prototype.map.call(
    form.querySelectorAll('input[name="pref"]:checked'), function (box) { return box.value; });
  var notes = form.elements.notes.value.trim();
  if (preferences.length > 0) notes = "Preferences: " + preferences.join(", ") + (notes ? ". " + notes : "");

  var payload = {
    action: "submitBooking",
    name: form.elements.name.value.trim(),
    regNo: form.elements.regNo.value.trim(),
    email: form.elements.email.value.trim(),
    phone: form.elements.phone.value.trim(),
    department: form.elements.department.value.trim(),
    year: form.elements.year.value,
    bookingDate: dateInput.value,
    timeSlot: slotSelect.value,
    people: form.elements.people.value,
    seat: form.querySelector('input[name="seat"]:checked').value,
    notes: notes,
    website: form.elements.website.value        
  };

  isSubmitting = true;
  setButtonLoading(submitButton, true, "Saving your booking…");
  try {
    var result = await postToScript(payload);

    if (result.success) {
      showConfirmation(result.booking);          
    } else {
      showServerErrors(result);
    }
  } catch (error) {
    showAlert(alertBox, "error", error.message);
  } finally {
    isSubmitting = false;
    setButtonLoading(submitButton, false);
  }
});


function showServerErrors(result) {
  showAlert(alertBox, "error", result.message || "The booking could not be saved. Please try again.");
  if (result.errors) {
    Object.keys(result.errors).forEach(function (field) { showFieldError(form, field, result.errors[field]); });
  }
  if (result.code === "SEAT_TAKEN") {            
    markBookedSeats(result.bookedSeats || []);
  }
  alertBox.scrollIntoView({ behavior: "smooth", block: "center" });
}

function showConfirmation(booking) {
  document.getElementById("c-id").textContent = booking.bookingId;
  document.getElementById("c-name").textContent = booking.name;
  document.getElementById("c-date").textContent = booking.bookingDate;
  document.getElementById("c-slot").textContent = booking.timeSlot;
  document.getElementById("c-seat").textContent = booking.seat;
  document.getElementById("c-people").textContent = booking.people;
  document.getElementById("form-card").hidden = true;
  document.getElementById("confirmation").hidden = false;
  document.getElementById("confirmation").scrollIntoView({ behavior: "smooth", block: "start" });
}

document.getElementById("book-again").addEventListener("click", function () { location.reload(); });
clearErrorOnInput(form);
form.querySelectorAll('input[name="seat"]').forEach(function (input) {
  input.addEventListener("change", function () { form.querySelector('.err[data-for="seat"]').textContent = ""; });
});
