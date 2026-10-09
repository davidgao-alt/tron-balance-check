// Shared helpers for the dashboard pages: requests with clear error messages,
// status line updates, busy buttons, safe table rendering and CSV download.
(function () {
  const NETWORK_ERROR =
    "Could not reach the server (network error). Check your connection and try again.";

  function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Display text for one cell value (jsonb columns arrive as objects).
  function formatCell(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  // Turns a failed response into a readable message (429, JSON {error}, or HTTP status).
  async function describeError(res) {
    if (res.status === 429) {
      const wait = Number(res.headers.get("Retry-After"));
      return (
        "Too many requests: the server limits how many requests can be made per minute. " +
        (wait > 0 ? `Try again in ${wait}s.` : "Wait a minute and try again.")
      );
    }
    const text = await res.text().catch(() => "");
    try {
      const data = JSON.parse(text);
      if (data && data.error) return String(data.error);
    } catch (_) {
      // not JSON
    }
    return `HTTP ${res.status}${res.statusText ? " " + res.statusText : ""}`;
  }

  async function request(url, options) {
    let res;
    try {
      res = await fetch(url, options);
    } catch (_) {
      throw new Error(NETWORK_ERROR);
    }
    if (!res.ok) throw new Error(await describeError(res));
    return res;
  }

  async function requestJson(url, options) {
    const res = await request(url, options);
    try {
      return await res.json();
    } catch (_) {
      throw new Error("Unexpected response from server (not JSON).");
    }
  }

  async function runSql(sql) {
    const data = await requestJson("/api/sql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql }),
    });
    if (!data || !Array.isArray(data.fields) || !Array.isArray(data.rows)) {
      throw new Error("Unexpected response from server.");
    }
    return data;
  }

  const STATUS_KINDS = ["loading", "success", "empty", "error"];

  function setStatus(el, kind, text) {
    if (!el) return;
    el.classList.add("ui-status");
    STATUS_KINDS.forEach((k) => el.classList.remove("ui-status--" + k));
    if (kind) el.classList.add("ui-status--" + kind);
    if (!el.hasAttribute("role")) el.setAttribute("role", "status");
    el.textContent = text;
  }

  function timeNow() {
    return new Date().toLocaleTimeString();
  }

  function rowsSummary(count) {
    if (count === 0) return `No results · ${timeNow()}`;
    return `${count} row${count === 1 ? "" : "s"} · ${timeNow()}`;
  }

  // Disables the buttons while task runs; a click while they are disabled is ignored.
  async function withBusy(buttons, task) {
    const list = buttons instanceof Element ? [buttons] : Array.from(buttons || []);
    if (list.some((b) => b.disabled)) return;
    list.forEach((b) => {
      b.disabled = true;
      b.setAttribute("aria-busy", "true");
    });
    try {
      return await task();
    } finally {
      list.forEach((b) => {
        b.disabled = false;
        b.removeAttribute("aria-busy");
      });
    }
  }

  // Runs task with busy buttons and a loading message; a thrown error goes to the status line.
  function run(opts, task) {
    const { buttons, status, loading = "Loading…", errorPrefix = "Error: ", onError } = opts;
    return withBusy(buttons, async () => {
      setStatus(status, "loading", loading);
      try {
        await task();
      } catch (err) {
        setStatus(status, "error", errorPrefix + err.message);
        if (onError) onError(err);
      }
    });
  }

  // Renders {fields, rows}: one row as a field/value table, several rows as a normal table.
  function renderTable(container, data) {
    const { fields, rows } = data;
    container.classList.toggle("vertical-mode", rows.length === 1);

    if (rows.length === 0) {
      container.innerHTML = "";
      return;
    }

    if (rows.length === 1) {
      const row = rows[0];
      const body = fields
        .map(
          (f) =>
            `<tr><th class="metric-name" scope="row">${escapeHtml(f)}</th>` +
            `<td class="metric-value">${escapeHtml(formatCell(row[f]))}</td></tr>`
        )
        .join("");
      container.innerHTML =
        '<table><thead><tr><th class="vertical-header">Metric</th>' +
        '<th class="vertical-header">Value</th></tr></thead>' +
        `<tbody>${body}</tbody></table>`;
      return;
    }

    const head = fields.map((f) => `<th>${escapeHtml(f)}</th>`).join("");
    const body = rows
      .map((row) => "<tr>" + fields.map((f) => `<td>${escapeHtml(formatCell(row[f]))}</td>`).join("") + "</tr>")
      .join("");
    container.innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }

  // Runs a SQL query and renders the result; on failure the old result is cleared.
  function runSqlInto({ sql, container, status, buttons, onResult, onError }) {
    if (!sql.trim()) {
      setStatus(status, "error", "Please enter a SQL query.");
      return Promise.resolve();
    }
    return run(
      {
        buttons,
        status,
        onError: (err) => {
          container.classList.remove("vertical-mode");
          container.innerHTML = "";
          if (onError) onError(err);
        },
      },
      async () => {
        const data = await runSql(sql);
        renderTable(container, data);
        setStatus(status, data.rows.length ? "success" : "empty", rowsSummary(data.rows.length));
        if (onResult) onResult(data);
      }
    );
  }

  // Downloads /api/sql-csv as a file; errors stay on the page instead of navigating away.
  function downloadCsv({ sql, status, buttons }) {
    if (!sql.trim()) {
      setStatus(status, "error", "Please enter a SQL query.");
      return Promise.resolve();
    }
    return run(
      { buttons, status, loading: "Preparing CSV…", errorPrefix: "CSV download failed: " },
      async () => {
        const res = await request("/api/sql-csv?sql=" + encodeURIComponent(sql));
        const blob = await res.blob();
        const match = /filename="?([^";]+)"?/.exec(res.headers.get("Content-Disposition") || "");
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = match ? match[1] : "query_result.csv";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setStatus(status, "success", `CSV downloaded · ${timeNow()}`);
      }
    );
  }

  window.UI = {
    escapeHtml,
    formatCell,
    requestJson,
    runSql,
    setStatus,
    rowsSummary,
    timeNow,
    run,
    renderTable,
    runSqlInto,
    downloadCsv,
  };
})();
