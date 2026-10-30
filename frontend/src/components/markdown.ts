/** Lightweight Markdown-to-HTML conversion used outside the editor bundle. */
const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function sanitizeHtml(html: string) {
  const template = window.document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("script,iframe,object,embed,form,style,link,meta").forEach((node) => node.remove());
  template.content.querySelectorAll("*").forEach((node) => {
    [...node.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      const safeEmbeddedImage =
        name === "src" && /^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(attr.value.trim());
      if (
        name.startsWith("on") ||
        name === "srcdoc" ||
        ((name === "href" || name === "src") &&
          (value.startsWith("javascript:") || (value.startsWith("data:") && !safeEmbeddedImage)))
      ) {
        node.removeAttribute(attr.name);
      }
    });
  });
  return template.innerHTML;
}

export function markdownToHtml(source: string) {
  const raw = (source || "").trim();
  if (/<\\s*\\/?\\s*(p|br|div|span|h[1-6]|ul|ol|li|table|thead|tbody|tr|th|td|blockquote|section|article|strong|b|em|i|u|s|a|img|hr)\\b/i.test(raw)) {
    return sanitizeHtml(source);
  }

  const safe = escapeHtml(source || "").replace(/\r\n/g, "\n");
  const lines = safe.split("\n");
  let html = "";
  let inUl = false;
  let inOl = false;
  const close = () => {
    if (inUl) { html += "</ul>"; inUl = false; }
    if (inOl) { html += "</ol>"; inOl = false; }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*\|.+\|$/.test(line) && /^\s*\|?\s*:?-{3,}:?\s*\|/.test(lines[i + 1] || "")) {
      close();
      const header = parseTableRow(line);
      i++;
      const rows: string[][] = [];
      while (i + 1 < lines.length && /^\s*\|.+\|$/.test(lines[i + 1]) && !/^\s*\|?\s*:?-{3,}:?\s*\|/.test(lines[i + 1])) {
        i++;
        rows.push(parseTableRow(lines[i]));
      }
      html += "<table><thead><tr>" + header.map((cell) => "<th>" + inline(cell) + "</th>").join("") +
        "</tr></thead><tbody>" + rows.map((row) => "<tr>" + row.map((cell) => "<td>" + inline(cell) + "</td>").join("") + "</tr>").join("") +
        "</tbody></table>";
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      if (!inUl) { close(); html += "<ul>"; inUl = true; }
      html += "<li>" + inline(line.replace(/^\s*[-*]\s+/, "")) + "</li>";
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      if (!inOl) { close(); html += "<ol>"; inOl = true; }
      html += "<li>" + inline(line.replace(/^\s*\d+[.)]\s+/, "")) + "</li>";
      continue;
    }
    close();
    if (!line.trim()) { html += "<p><br></p>"; continue; }
    if (/^###\s+/.test(line)) { html += "<h3>" + inline(line.replace(/^###\s+/, "")) + "</h3>"; continue; }
    if (/^##\s+/.test(line)) { html += "<h2>" + inline(line.replace(/^##\s+/, "")) + "</h2>"; continue; }
    if (/^#\s+/.test(line)) { html += "<h1>" + inline(line.replace(/^#\s+/, "")) + "</h1>"; continue; }
    if (/^>\s+/.test(line)) { html += "<blockquote>" + inline(line.replace(/^>\s+/, "")) + "</blockquote>"; continue; }
    html += "<p>" + inline(line) + "</p>";
  }
  close();
  return html || "<p><br></p>";
}

function parseTableRow(line: string) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function inline(value: string) {
  const codes: string[] = [];
  let text = value.replace(/\x60([^\x60]+)\x60/g, (_, code: string) => {
    const key = String.fromCharCode(0) + codes.length + String.fromCharCode(0);
    codes.push("<code>" + code + "</code>");
    return key;
  });
  text = text
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/~~([^~]+)~~/g, "<s>$1</s>");
  codes.forEach((code, index) => {
    text = text.replace(String.fromCharCode(0) + index + String.fromCharCode(0), code);
  });
  return text;
}
