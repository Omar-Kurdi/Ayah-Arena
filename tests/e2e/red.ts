import type { Page } from '@playwright/test';

/**
 * The "no red" guardrail, measured on computed styles.
 *
 * The palette is warm: parchment (#ece5d5), brass (#d9b45c) and a deep blue
 * black, so several of its colours have a red channel that leads. What the
 * rule forbids is red *as a signal* -- a colour that reads as an error. So a
 * colour counts as red when its red channel clearly dominates both others,
 * which the palette never does:
 *
 *   parchment  236,229,213  ->  lead over green   7
 *   brass      217,180,092  ->  lead over green  37
 *   verdant    111,184,148  ->  not red at all
 *   crimson    220,020,060  ->  lead over green 200
 *
 * Transparent and fully see-through colours are ignored: they paint nothing.
 */

const LEAD = 60; // how far red must run ahead of both other channels
const FLOOR = 120; // and how bright it must be to register as a signal colour

const PROPERTIES = [
  'color',
  'background-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'text-decoration-color',
  'fill',
  'stroke',
] as const;

export interface RedFinding {
  selector: string;
  property: string;
  value: string;
  text: string;
}

/** Every element whose computed styles include a red signal colour. */
export function forbiddenReds(page: Page): Promise<RedFinding[]> {
  return page.evaluate(
    ({ properties, lead, floor }) => {
      const parse = (value: string) => {
        const match = /rgba?\(([^)]+)\)/.exec(value);
        if (!match) return null;
        const parts = match[1].split(/[,/]\s*/).map((part) => Number.parseFloat(part));
        const [r, g, b] = parts;
        const alpha = parts.length > 3 ? parts[3] : 1;
        if (![r, g, b].every(Number.isFinite)) return null;
        return { r, g, b, a: Number.isFinite(alpha) ? alpha : 1 };
      };

      const describe = (el: Element) => {
        const id = el.id ? `#${el.id}` : '';
        const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).join('.')}` : '';
        return `${el.tagName.toLowerCase()}${id}${cls}`.slice(0, 120);
      };

      const findings: { selector: string; property: string; value: string; text: string }[] = [];
      for (const el of document.querySelectorAll('body, body *')) {
        const styles = getComputedStyle(el);
        for (const property of properties) {
          const value = styles.getPropertyValue(property);
          const rgb = parse(value);
          if (!rgb || rgb.a === 0) continue;
          if (rgb.r >= floor && rgb.r - rgb.g >= lead && rgb.r - rgb.b >= lead) {
            findings.push({
              selector: describe(el),
              property,
              value,
              text: (el.textContent ?? '').trim().slice(0, 40),
            });
          }
        }
      }
      return findings;
    },
    { properties: [...PROPERTIES], lead: LEAD, floor: FLOOR }
  );
}

/** How many elements the sweep looked at, so an empty result means something. */
export function paintedElements(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelectorAll('body, body *').length);
}
