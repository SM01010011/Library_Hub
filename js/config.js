/* =====================================================================
   config.js – the ONLY place where the backend URL is stored
   ---------------------------------------------------------------------
   STEP: after you deploy Google Apps Script as a Web App, copy the
   "Web app URL" (it ends with /exec) and paste it between the quotes
   below. Every other JavaScript file reads this one variable.

   Example of a real value:
   const SCRIPT_URL = "https://script.google.com/macros/s/AKfycb.../exec";
   ===================================================================== */

const SCRIPT_URL = "YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL";   // <-- PASTE YOUR URL HERE

/* Note: the Google Sheet ID is NOT here. It lives only inside
   google-apps-script/Code.gs, so the website never sees it. */
