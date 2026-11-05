// Export formats for the visible module list. Pure.

const COLUMNS = ['change', 'repository', 'module', 'from_repository'];

/** One module name per line. */
export function toNames(rows) {
    return rows.map((r) => r.module).join('\n');
}

/** RFC 4180 CSV with a header row. */
export function toCsv(rows) {
    const quote = (v) => (/[",\n\r]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : String(v));
    return [COLUMNS.join(','), ...rows.map((r) => COLUMNS.map((c) => quote(r[c] ?? '')).join(','))].join('\r\n');
}

/** GitHub-flavoured Markdown table. */
export function toMarkdown(rows) {
    const cell = (v) => String(v ?? '').replaceAll('|', '\\|');
    const head = ['Change', 'Repository', 'Module', 'From repository'];
    return [
        `| ${head.join(' | ')} |`,
        `| ${head.map(() => '---').join(' | ')} |`,
        ...rows.map((r) => `| ${COLUMNS.map((c) => cell(r[c])).join(' | ')} |`),
    ].join('\n');
}

/** JSON document with context. */
export function toJson(rows, context) {
    return JSON.stringify({ ...context, modules: rows }, null, 2);
}

/** Safe file name for a comparison export. */
export function exportFileName(from, to, extension) {
    const slug = (v) => String(v ?? 'start').replace(/[^a-z0-9.-]+/gi, '_');
    return `glowing-modules_${slug(from)}_${slug(to)}.${extension}`;
}
