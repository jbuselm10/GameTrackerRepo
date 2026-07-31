window.GameTracker = {
  escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  },

  disableAutofill(root = document) {
    if (!root) return;

    root.querySelectorAll("form").forEach((form) => {
      form.setAttribute("autocomplete", "off");
      form.setAttribute("data-form-type", "other");
    });

    root.querySelectorAll("input, select, textarea").forEach((el) => {
      const type = (el.getAttribute("type") || "").toLowerCase();
      if (type === "hidden" || type === "checkbox" || type === "radio" || type === "submit" || type === "button") {
        return;
      }

      // Mobile Chrome and Safari may ignore autocomplete="off" on text fields.
      // "new-password" also suppresses their saved-value suggestions while
      // leaving these non-login fields fully editable.
      const isTextField =
        el.tagName === "TEXTAREA"
        || el.tagName === "INPUT" && (type === "" || type === "text");
      el.setAttribute("autocomplete", isTextField ? "new-password" : "off");
      el.setAttribute("autocorrect", "off");
      el.setAttribute("autocapitalize", "none");
      el.setAttribute("spellcheck", "false");
      el.setAttribute("aria-autocomplete", "none");
      el.setAttribute("data-lpignore", "true");
      el.setAttribute("data-1p-ignore", "true");
      el.setAttribute("data-bwignore", "true");
      el.setAttribute("data-form-type", "other");
    });
  },

  async api(url, method = "GET", body) {
    const options = {
      method,
      headers: { Accept: "application/json" },
    };
    if (body !== undefined) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }

    let response;
    try {
      response = await fetch(url, options);
    } catch (err) {
      if (window.Sentry?.captureException) {
        Sentry.captureException(err, { extra: { url, method } });
      }
      throw err;
    }

    let data = null;
    const text = await response.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        const err = new Error("Server returned invalid JSON. Is PHP running?");
        if (window.Sentry?.captureException) {
          Sentry.captureException(err, {
            extra: { url, method, status: response.status, cause: parseErr.message },
          });
        }
        throw err;
      }
    }
    if (!response.ok) {
      const message = (data && data.error) || `Request failed (${response.status})`;
      const err = new Error(message);
      if (window.Sentry?.captureException) {
        Sentry.captureException(err, {
          extra: { url, method, status: response.status },
        });
      }
      throw err;
    }
    return data;
  },

  syncPlayerCheckboxStyles(container, savedPlayerIds, options = {}) {
    const {
      active = true,
      inputSelector = 'input[type="checkbox"]',
      getPlayerId = (input) => input.value,
    } = options;

    if (!container) return;

    const saved =
      savedPlayerIds instanceof Set
        ? savedPlayerIds
        : new Set((savedPlayerIds || []).map(String));

    container.querySelectorAll(inputSelector).forEach((input) => {
      const label = input.closest("label");
      if (!active) {
        input.classList.remove("gt-pending", "gt-saved");
        label?.classList.remove("gt-pending");
        return;
      }

      const id = getPlayerId(input);
      const savedChecked = saved.has(id);
      if (input.checked === savedChecked) {
        input.classList.toggle("gt-saved", input.checked);
        input.classList.remove("gt-pending");
        label?.classList.remove("gt-pending");
      } else {
        input.classList.add("gt-pending");
        input.classList.remove("gt-saved");
        label?.classList.add("gt-pending");
      }
    });
  },
};

document.addEventListener("DOMContentLoaded", () => {
  GameTracker.disableAutofill();
});
