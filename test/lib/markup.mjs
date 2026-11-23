// Shared markup well-formedness checks for item figures (SVG rules in docs/SPEC.md).
import assert from 'node:assert/strict';

export function checkSvg(html, where) {
  const tagRe = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g;
  const stack = [];
  let last = 0;
  let m;
  while ((m = tagRe.exec(html))) {
    const between = html.slice(last, m.index);
    assert.ok(!/[<>]/.test(between), `${where}: stray angle bracket near ${m.index}`);
    last = tagRe.lastIndex;
    const [, close, name, , self] = m;
    if (close) assert.equal(stack.pop(), name, `${where}: mismatched </${name}>`);
    else if (!self) stack.push(name);
  }
  assert.ok(!/[<>]/.test(html.slice(last)), `${where}: trailing junk`);
  assert.deepEqual(stack, [], `${where}: unclosed tags`);
  assert.ok(!/\sid=/.test(html), `${where}: id attribute`);
  assert.ok(!/<defs|url\(#/.test(html), `${where}: defs/url ref`);
  assert.ok(!/NaN|undefined|Infinity/.test(html), `${where}: bad number`);
  for (const f of html.matchAll(/\sfill="([^"]*)"/g)) assert.equal(f[1], 'currentColor', `${where}: fill attribute ${f[1]}`);
  for (const c of html.matchAll(/class="([^"]*)"/g)) assert.match(c[1], /^f-(none|grey|solid)$/, `${where}: class ${c[1]}`);
  assert.ok(html.startsWith('<svg') && html.endsWith('</svg>'), `${where}: single svg`);
  assert.equal((html.match(/<svg/g) || []).length, 1, `${where}: nested svg`);
  assert.ok(html.includes('width="100%"'), `${where}: width 100%`);
}

// Any item figure: figures (matrix/spatial) must be one svg; series items are plain text / a div.
export function checkItemMarkup(item, where) {
  const figs = item.category === 'series' ? [] : [item.stem, ...item.options].filter((s) => s !== '');
  for (const [i, f] of figs.entries()) checkSvg(f, `${where} figure ${i}`);
  for (const s of [item.stem, ...item.options]) {
    assert.ok(!/\sid=|<defs|url\(#/.test(s), `${where}: id/defs/url`);
    assert.ok(!/NaN|undefined/.test(s), `${where}: bad text`);
    assert.ok(!/<script|on\w+=/i.test(s), `${where}: script/handler`);
  }
}
