


(function setupNavigation() {
  var toggleButton = document.querySelector(".nav-toggle");
  var menu = document.getElementById("nav-menu");

  
  if (toggleButton && menu) {
    toggleButton.addEventListener("click", function () {
      var isOpen = menu.classList.toggle("open");
      toggleButton.setAttribute("aria-expanded", isOpen ? "true" : "false");
      toggleButton.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
    });
  }

  
  var currentPage = location.pathname.split("/").pop().replace(".html", "") || "index";
  document.querySelectorAll("#nav-menu a").forEach(function (link) {
    var linkPage = link.getAttribute("href").replace(".html", "");
    if (linkPage === currentPage) link.setAttribute("aria-current", "page");
  });

  
  var yearSpan = document.getElementById("year");
  if (yearSpan) yearSpan.textContent = new Date().getFullYear();
})();




function isScriptConfigured() {
  return typeof SCRIPT_URL === "string" && SCRIPT_URL.indexOf("https://script.google.com/") === 0;
}

var NOT_CONFIGURED_MESSAGE =
  "The website is not connected to Google Sheets yet. Paste your Apps Script Web App URL into js/config.js.";


async function requestScript(url, options) {
  if (!isScriptConfigured()) throw new Error(NOT_CONFIGURED_MESSAGE);

  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, 25000);   
  options = options || {};
  options.signal = controller.signal;

  var response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    if (error.name === "AbortError") throw new Error("The server took too long to answer. Please try again.");
    throw new Error("Network problem. Check your internet connection and try again.");
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) throw new Error("The server returned an error (" + response.status + "). Please try again.");

  var text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    
    throw new Error("Unexpected reply from the server. Check that the Web App is deployed with access set to 'Anyone'.");
  }
}


function postToScript(payload) {
  return requestScript(SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });
}


function getFromScript(params) {
  return requestScript(SCRIPT_URL + "?" + new URLSearchParams(params).toString());
}


function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Shows a coloured message box. type = "error" | "ok" | "info"
function showAlert(box, type, message) {
  box.className = "alert show " + type;
  box.textContent = message;
}
function hideAlert(box) { box.className = "alert"; box.textContent = ""; }

// Field error helpers: each input has a <span class="err" data-for="fieldName">
function showFieldError(form, fieldName, message) {
  var errorSpan = form.querySelector('.err[data-for="' + fieldName + '"]');
  var field = form.elements[fieldName];
  if (errorSpan) errorSpan.textContent = message;
  if (field && field.classList) field.classList.add("invalid");
}
function clearFieldErrors(form) {
  form.querySelectorAll(".err").forEach(function (span) { span.textContent = ""; });
  form.querySelectorAll(".invalid").forEach(function (field) { field.classList.remove("invalid"); });
}
// Clear one field's error as soon as the user edits it
function clearErrorOnInput(form) {
  form.addEventListener("input", function (event) {
    var name = event.target.name;
    var errorSpan = form.querySelector('.err[data-for="' + name + '"]');
    if (errorSpan) errorSpan.textContent = "";
    event.target.classList.remove("invalid");
  });
}

// Simple format checks (the server repeats them – never trust only the browser)
function isValidEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value); }
function isValidPhone(value) { return /^[6-9][0-9]{9}$/.test(value); }        // 10-digit Indian mobile
function isValidRegNo(value) { return /^[0-9]{8}$/.test(value); }             // 8 digits (as in the original form)

// Turns the button into "loading" state and back
function setButtonLoading(button, isLoading, loadingText) {
  if (isLoading) {
    button.dataset.label = button.querySelector(".label").textContent;
    button.querySelector(".label").textContent = loadingText;
  } else {
    button.querySelector(".label").textContent = button.dataset.label || button.querySelector(".label").textContent;
  }
  button.classList.toggle("loading", isLoading);
  button.disabled = isLoading;
}

// Today as YYYY-MM-DD in the visitor's local time (used for the date picker)
function todayAsText() {
  var now = new Date();
  var month = String(now.getMonth() + 1).padStart(2, "0");
  var day = String(now.getDate()).padStart(2, "0");
  return now.getFullYear() + "-" + month + "-" + day;
}
