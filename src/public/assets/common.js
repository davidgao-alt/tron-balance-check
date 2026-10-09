// Shared helpers for the dashboard pages: requests with clear error messages,
// status line updates, busy buttons, safe table rendering with readable
// number/time formatting, CSV download, click-to-copy and remembered
// open/closed state of collapsible sections.
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

  // ---------- display formatting (screen only; CSV export keeps raw values) ----------

  const NUMBER_RE = /^-?\d+(?:\.\d+)?$/;
  // Identifiers and columns explicitly holding raw values are shown as stored.
  const AS_IS_FIELD_RE = /(^|_)(id|raw)(_|$)/i;
  const TIMESTAMP_RE =
    /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;
  // TRON address, EVM address, or 64-hex transaction hash.
  const ADDRESS_RE = /^(?:T[1-9A-HJ-NP-Za-km-z]{33}|0x[0-9a-fA-F]{40}|(?:0x)?[0-9a-fA-F]{64})$/;

  // "574869710" → "574,869,710"; "0.900000" → "0.9". Never rounds.
  function formatNumber(text) {
    const negative = text.startsWith("-");
    const [intPart, fraction = ""] = (negative ? text.slice(1) : text).split(".");
    const trimmed = fraction.replace(/0+$/, "");
    return (
      (negative ? "-" : "") +
      intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",") +
      (trimmed ? "." + trimmed : "")
    );
  }

  // Drops the "T", milliseconds and "Z"; labels the zone without converting it.
  // Columns named *hkt* hold Hong Kong wall-clock time even when serialised with "Z".
  function formatTimestamp(field, match) {
    const [, date, time, zone] = match;
    let label = "";
    if (/hkt/i.test(field)) label = "HKT";
    else if (zone === "Z") label = "UTC";
    else if (zone) label = zone;
    else if (/utc/i.test(field)) label = "UTC";
    return `${date} ${time}${label ? " " + label : ""}`;
  }

  // How one value is shown in a table cell: { text, cls, title }.
  function cellView(field, value) {
    if (value === null || value === undefined) return { text: "", cls: "" };
    if (typeof value === "object") {
      const json = JSON.stringify(value);
      return { text: json, cls: "mono clip", title: json };
    }

    const raw = String(value);
    if (NUMBER_RE.test(raw)) {
      const text = AS_IS_FIELD_RE.test(field) ? raw : formatNumber(raw);
      return { text, cls: "num", title: text === raw ? "" : raw };
    }
    const ts = TIMESTAMP_RE.exec(raw);
    if (ts) return { text: formatTimestamp(field, ts), cls: "", title: raw };
    if (ADDRESS_RE.test(raw)) return { text: raw, cls: "mono copyable", title: "Click to copy" };
    return { text: raw, cls: "" };
  }

  // <td> markup for one value, escaped.
  function td(field, value, extraCls) {
    const view = cellView(field, value);
    const cls = [view.cls, extraCls].filter(Boolean).join(" ");
    return (
      "<td" +
      (cls ? ` class="${cls}"` : "") +
      (view.title ? ` title="${escapeHtml(view.title)}"` : "") +
      `>${escapeHtml(view.text)}</td>`
    );
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
            td(f, row[f], "metric-value") +
            "</tr>"
        )
        .join("");
      container.innerHTML =
        '<table><thead><tr><th class="vertical-header">Metric</th>' +
        '<th class="vertical-header">Value</th></tr></thead>' +
        `<tbody>${body}</tbody></table>`;
      return;
    }

    // Right-align a column's header when every non-empty value in it is a number.
    const numeric = fields.map((f) =>
      rows.every((row) => row[f] === null || row[f] === undefined || NUMBER_RE.test(String(row[f])))
    );
    const head = fields
      .map((f, i) => `<th${numeric[i] ? ' class="num"' : ""}>${escapeHtml(f)}</th>`)
      .join("");
    const body = rows
      .map((row) => "<tr>" + fields.map((f) => td(f, row[f])).join("") + "</tr>")
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

  // ---------- click-to-copy ----------

  document.addEventListener("click", (e) => {
    const el = e.target.closest && e.target.closest(".copyable");
    if (!el || !navigator.clipboard) return;
    if (String(window.getSelection())) return; // the user is selecting text
    navigator.clipboard.writeText(el.dataset.copy || el.textContent.trim()).then(() => {
      el.classList.add("copied");
      setTimeout(() => el.classList.remove("copied"), 1200);
    });
  });

  // ---------- collapsible sections remember open/closed ----------

  // <details data-remember="name"> keeps its state per page in localStorage.
  function rememberDetails() {
    document.querySelectorAll("details[data-remember]").forEach((el) => {
      const key = `ui:${location.pathname}:${el.dataset.remember}`;
      try {
        const saved = localStorage.getItem(key);
        if (saved !== null) el.open = saved === "open";
      } catch (_) {
        // storage unavailable: keep the default
      }
      el.addEventListener("toggle", () => {
        try {
          localStorage.setItem(key, el.open ? "open" : "closed");
        } catch (_) {
          // ignore
        }
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", rememberDetails);
  } else {
    rememberDetails();
  }

  window.UI = {
    escapeHtml,
    formatCell,
    formatNumber,
    cellView,
    td,
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
