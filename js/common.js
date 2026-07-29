window.GameTracker = {
  escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
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
      if (!active) {
        input.classList.remove("gt-pending", "gt-saved");
        return;
      }

      const id = getPlayerId(input);
      const savedChecked = saved.has(id);
      if (input.checked === savedChecked) {
        input.classList.toggle("gt-saved", input.checked);
        input.classList.remove("gt-pending");
      } else {
        input.classList.add("gt-pending");
        input.classList.remove("gt-saved");
      }
    });
  },
};
