window.GameTracker = {
  // Without a cap, a stalled mobile connection leaves requests pending forever
  // and pages sit on "Loading…" with nothing to act on.
  apiTimeoutMs: 15000,

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
      el.setAttribute("autocapitalize", isTextField ? "words" : "none");
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

    if (navigator.onLine === false) {
      throw new Error("You appear to be offline. Reconnect and try again.");
    }

    const controller =
      typeof AbortController === "undefined" ? null : new AbortController();
    if (controller) {
      options.signal = controller.signal;
    }
    const timeoutMs = window.GameTracker.apiTimeoutMs;
    const timer = controller
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

    let response;
    let text;
    try {
      response = await fetch(url, options);
      // Read the body inside the timeout too: a half-open connection can
      // deliver headers and then stall forever on the body.
      text = await response.text();
    } catch (err) {
      if (window.Sentry?.captureException) {
        Sentry.captureException(err, {
          extra: { url, method, timedOut: err && err.name === "AbortError" },
        });
      }
      if (err && err.name === "AbortError") {
        throw new Error(
          `The server did not respond within ${Math.round(timeoutMs / 1000)} seconds. Check your connection and try again.`
        );
      }
      throw new Error("Could not reach the server. Check your connection and try again.");
    } finally {
      if (timer) clearTimeout(timer);
    }

    let data = null;
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

  confirmUnsavedChanges({ message, saveLabel = "Save", discardLabel = "Discard", onSave, onDiscard } = {}) {
    const overlay = document.createElement("div");
    overlay.className = "gt-modal-overlay";

    const modal = document.createElement("div");
    modal.className = "gt-panel gt-modal";
    modal.setAttribute("role", "alertdialog");
    modal.setAttribute("aria-modal", "true");

    const messageEl = document.createElement("p");
    messageEl.className = "gt-modal-message";
    messageEl.textContent = message;

    const actions = document.createElement("div");
    actions.className = "gt-modal-actions";

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "gt-btn text-sm";
    saveBtn.textContent = saveLabel;

    const discardBtn = document.createElement("button");
    discardBtn.type = "button";
    discardBtn.className = "gt-btn-secondary text-sm";
    discardBtn.textContent = discardLabel;

    actions.append(saveBtn, discardBtn);
    modal.append(messageEl, actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    function cleanup() {
      overlay.remove();
      document.removeEventListener("keydown", onKeydown);
    }

    function onKeydown(event) {
      if (event.key === "Escape") cleanup();
    }

    document.addEventListener("keydown", onKeydown);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) cleanup();
    });
    saveBtn.addEventListener("click", () => {
      cleanup();
      onSave?.();
    });
    discardBtn.addEventListener("click", () => {
      cleanup();
      onDiscard?.();
    });

    saveBtn.focus();
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

  /**
   * Display-only alphabetical sort. Does not mutate the input array.
   * @param {Array} items
   * @param {(item: any) => string} [getName]
   */
  sortByName(items, getName = (item) => item?.name ?? "") {
    const list = Array.isArray(items) ? items : [];
    return [...list].sort((a, b) =>
      String(getName(a) ?? "").localeCompare(String(getName(b) ?? ""), undefined, {
        sensitivity: "base",
      })
    );
  },
};

document.addEventListener("DOMContentLoaded", () => {
  GameTracker.disableAutofill();
});

// A script error used to leave pages sitting on their initial "Loading…" text
// with no clue what went wrong, which is impossible to diagnose on a phone.
function reportFatalError(detail) {
  const statuses = document.querySelectorAll("#list-status, #page-status");
  statuses.forEach((el) => {
    if (!/^\s*Loading/i.test(el.textContent || "")) return;
    el.textContent = `Something went wrong loading this page: ${detail}. Pull down to refresh, or reopen the page.`;
    el.classList.remove("hidden");
    el.classList.add("gt-status-err");
  });
}

window.addEventListener("error", (event) => {
  reportFatalError(event.message || "script error");
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  reportFatalError((reason && reason.message) || "unexpected error");
});
