// Load the public reader's column metadata only when someone opens an editor's schema.
(() => {
  function columnQuery(tables) {
    const names = tables.map(name => "'" + name.replace(/'/g, "''") + "'").join(", ");
    return `SELECT c.relname AS table_name, a.attname AS column_name,
                   pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type
            FROM pg_catalog.pg_attribute a
            JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname IN (${names})
              AND a.attnum > 0 AND NOT a.attisdropped
              AND has_column_privilege(c.oid, a.attname, 'SELECT')
            ORDER BY c.relname, a.attnum`;
  }

  function tableCard(name, columns) {
    const escape = UI.escapeHtml;
    const heading = `<h3>${escape(name)}</h3>`;
    if (!columns.length) {
      return `<section class="schema-table">${heading}<p>No readable columns.</p></section>`;
    }
    const rows = columns.map(column =>
      `<tr><th scope="row"><code>${escape(column.column_name)}</code></th>` +
      `<td>${escape(column.data_type)}</td></tr>`
    ).join("");
    return `<section class="schema-table">${heading}<table aria-label="${escape(name)} columns">` +
      '<thead><tr><th scope="col">Column</th><th scope="col">Type</th></tr></thead>' +
      `<tbody>${rows}</tbody></table></section>`;
  }

  function mount(editor) {
    const tables = editor.dataset.schemaTables.trim().split(/\s+/);
    const workspace = document.createElement("div");
    workspace.className = "sql-workspace";
    workspace.innerHTML =
      '<div class="sql-layout"><details class="sql-schema"><summary>Schema</summary>' +
      '<div class="schema-body" tabindex="0" role="region" aria-label="Table definitions">' +
      '<p class="schema-status" role="status"></p><div class="schema-tables"></div>' +
      '</div></details></div>';
    const layout = workspace.firstElementChild;
    const panel = layout.querySelector("details");
    const status = panel.querySelector(".schema-status");
    const content = panel.querySelector(".schema-tables");
    editor.before(workspace);
    layout.append(editor);

    let state = "idle";
    panel.addEventListener("toggle", async () => {
      if (!panel.open || state !== "idle") return;
      state = "loading";
      status.textContent = "Loading columns…";
      try {
        const { rows } = await UI.runSql(columnQuery(tables), editor.dataset.queryOrigin);
        const cards = tables.map(name => tableCard(name, rows.filter(row => row.table_name === name)));
        const join = editor.dataset.schemaJoin;
        const showJoin = join && tables.every(name => rows.some(row => row.table_name === name));
        content.innerHTML = (showJoin ? `<p class="schema-join">Join on <code>${UI.escapeHtml(join)}</code></p>` : "") +
          cards.join("");
        status.textContent = "";
        state = "ready";
      } catch (error) {
        status.textContent = `Could not load schema. ${error.message} Close and reopen Schema to retry.`;
        state = "idle";
      }
    });
  }

  document.querySelectorAll("textarea[data-schema-tables]").forEach(mount);
})();
