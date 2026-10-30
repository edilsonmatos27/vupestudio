// Strict allow-list SVG rebuilder. Rejects scripts, event handlers, external references,
// foreignObject, <image>, style blocks and any element/attribute not explicitly allowed.
// Output is re-serialized from parsed tokens, never passed through verbatim.

const ALLOWED_ELEMENTS = new Set([
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "polygon",
  "polyline",
  "line",
  "title",
  "desc",
]);

const ALLOWED_ATTRS = new Set([
  "width",
  "height",
  "viewBox",
  "version",
  "xmlns",
  "d",
  "fill",
  "stroke",
  "stroke-width",
  "opacity",
  "fill-opacity",
  "stroke-opacity",
  "fill-rule",
  "transform",
  "x",
  "y",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "points",
  "x1",
  "y1",
  "x2",
  "y2",
]);

const SAFE_VALUE = /^[a-zA-Z0-9\s.,#%()+\-:/=]*$/;

export class SvgSanitizeError extends Error {}

export function sanitizeSvg(input: string): { svg: string; shapeCount: number } {
  if (input.length > 8 * 1024 * 1024) throw new SvgSanitizeError("SVG muito grande.");
  const src = input.replace(/<\?xml[^>]*\?>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  if (/<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(src))
    throw new SvgSanitizeError("SVG contém declarações não permitidas.");

  const tokenRe = /<\s*(\/?)\s*([a-zA-Z][\w:-]*)([^>]*?)(\/?)\s*>|([^<]+)/g;
  const out: string[] = [];
  const stack: string[] = [];
  let shapeCount = 0;
  let sawRoot = false;
  let m: RegExpExecArray | null;

  while ((m = tokenRe.exec(src))) {
    if (m[5] !== undefined) {
      const text = m[5];
      if (text.trim() === "") continue;
      const top = stack[stack.length - 1];
      if (top === "title" || top === "desc") {
        out.push(text.replace(/[<>&"']/g, ""));
        continue;
      }
      throw new SvgSanitizeError("Conteúdo de texto não permitido no SVG.");
    }
    const closing = m[1] === "/";
    const name = m[2]!;
    const attrStr = m[3] ?? "";
    const selfClose = m[4] === "/" || /\/\s*$/.test(attrStr);
    if (!ALLOWED_ELEMENTS.has(name))
      throw new SvgSanitizeError(`Elemento <${name}> não permitido.`);

    if (closing) {
      if (stack.pop() !== name) throw new SvgSanitizeError("SVG malformado.");
      out.push(`</${name}>`);
      continue;
    }
    if (name === "svg") {
      if (sawRoot && stack.length === 0) throw new SvgSanitizeError("Múltiplas raízes SVG.");
      sawRoot = true;
    } else if (stack.length === 0) {
      throw new SvgSanitizeError("Elemento fora da raiz SVG.");
    }
    const attrs: string[] = [];
    const attrRe = /([a-zA-Z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let a: RegExpExecArray | null;
    const cleanAttrStr = attrStr.replace(/\/\s*$/, "");
    let consumed = cleanAttrStr;
    while ((a = attrRe.exec(cleanAttrStr))) {
      consumed = consumed.replace(a[0], "");
      const an = a[1]!;
      const av = (a[3] ?? a[4] ?? "").trim();
      if (/^on/i.test(an) || (an.includes(":") && an !== "xmlns"))
        throw new SvgSanitizeError("Atributo não permitido.");
      if (!ALLOWED_ATTRS.has(an)) continue;
      if (an === "xmlns") {
        if (av !== "http://www.w3.org/2000/svg") throw new SvgSanitizeError("Namespace inválido.");
        attrs.push(`xmlns="http://www.w3.org/2000/svg"`);
        continue;
      }
      if (!SAFE_VALUE.test(av) || /url\s*\(|javascript|data:|expression/i.test(av)) {
        throw new SvgSanitizeError("Valor de atributo não permitido.");
      }
      attrs.push(`${an}="${av}"`);
    }
    if (consumed.trim() !== "") throw new SvgSanitizeError("Atributos malformados no SVG.");
    if (name === "svg" && !attrs.some((x) => x.startsWith("xmlns=")))
      attrs.unshift(`xmlns="http://www.w3.org/2000/svg"`);
    if (["path", "rect", "circle", "ellipse", "polygon", "polyline", "line"].includes(name))
      shapeCount++;
    out.push(`<${name}${attrs.length ? " " + attrs.join(" ") : ""}${selfClose ? "/>" : ">"}`);
    if (!selfClose) stack.push(name);
  }
  if (!sawRoot || stack.length) throw new SvgSanitizeError("SVG malformado.");
  if (shapeCount === 0) throw new SvgSanitizeError("O SVG não contém formas vetoriais.");
  return { svg: out.join(""), shapeCount };
}
