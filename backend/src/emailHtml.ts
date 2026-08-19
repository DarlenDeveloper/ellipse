import sanitizeHtml from "sanitize-html";

/** Keep common email-signature formatting while removing executable markup. */
export function sanitizeEmailHtml(input?: string): string | undefined {
  if (!input?.trim()) return undefined;
  return sanitizeHtml(input, {
    allowedTags: ["a", "b", "blockquote", "br", "div", "em", "font", "hr", "i", "img", "li", "ol", "p", "span", "strong", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul"],
    allowedAttributes: {
      "*": ["style"],
      a: ["href", "target", "rel", "title"],
      img: ["src", "alt", "width", "height", "title"],
      table: ["border", "cellpadding", "cellspacing", "width"],
      td: ["colspan", "rowspan", "width", "height", "valign"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    transformTags: { a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }, true) },
  });
}
