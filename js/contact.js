

var form = document.getElementById("contact-form");
var alertBox = document.getElementById("form-alert");
var submitButton = document.getElementById("submit-btn");
var isSubmitting = false;                       

function validateForm() {
  clearFieldErrors(form);
  var hasError = false;
  function fail(field, message) { showFieldError(form, field, message); hasError = true; }

  var phone = form.elements.phone.value.trim();
  if (form.elements.name.value.trim().length < 3) fail("name", "Enter your name (at least 3 characters).");
  if (!isValidEmail(form.elements.email.value.trim())) fail("email", "Enter a valid email address.");
  if (phone !== "" && !isValidPhone(phone)) fail("phone", "Enter a 10-digit mobile number or leave this empty.");
  if (form.elements.subject.value.trim().length < 3) fail("subject", "Enter a subject (at least 3 characters).");
  var message = form.elements.message.value.trim();
  if (message.length < 10) fail("message", "Write at least 10 characters so we can help you.");
  if (message.length > 1000) fail("message", "Message can be at most 1000 characters.");
  if (!form.elements.consent.checked) fail("consent", "Please tick the box so we can contact you.");
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

  var payload = {
    action: "submitContact",
    name: form.elements.name.value.trim(),
    email: form.elements.email.value.trim(),
    phone: form.elements.phone.value.trim(),
    subject: form.elements.subject.value.trim(),
    message: form.elements.message.value.trim(),
    website: form.elements.website.value        
  };

  isSubmitting = true;
  setButtonLoading(submitButton, true, "Sending…");
  try {
    var result = await postToScript(payload);
    if (result.success) {
      document.getElementById("c-id").textContent = result.messageId;
      document.getElementById("form-card").hidden = true;
      document.getElementById("confirmation").hidden = false;
      document.getElementById("confirmation").scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      showAlert(alertBox, "error", result.message || "Your message could not be sent. Please try again.");
      if (result.errors) {
        Object.keys(result.errors).forEach(function (field) { showFieldError(form, field, result.errors[field]); });
      }
    }
  } catch (error) {
    showAlert(alertBox, "error", error.message);
  } finally {
    isSubmitting = false;
    setButtonLoading(submitButton, false);
  }
});

document.getElementById("send-another").addEventListener("click", function () { location.reload(); });
clearErrorOnInput(form);
