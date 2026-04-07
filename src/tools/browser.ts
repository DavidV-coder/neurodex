/**
 * NeuroDEX Browser Automation Tool
 * Uses Playwright to control a browser — navigate, click, fill, screenshot, etc.
 */
import { permissionManager } from '../security/permissions.js';

export interface BrowserAction {
  action: 'navigate' | 'click' | 'fill' | 'screenshot' | 'evaluate' | 'waitFor' |
          'getText' | 'getLinks' | 'scroll' | 'submit' | 'back' | 'forward' |
          'newPage' | 'closePage' | 'title' | 'url';
  url?: string;
  selector?: string;
  value?: string;
  script?: string;
  direction?: 'up' | 'down';
  amount?: number;
}

export interface BrowserResult {
  success: boolean;
  output?: string;
  screenshot?: string;  // base64 PNG
  error?: string;
}

let browserInstance: unknown = null;
let pageInstance: unknown = null;
let playwrightAvailable: boolean | null = null;

async function ensureBrowser(): Promise<{ browser: unknown; page: unknown }> {
  if (playwrightAvailable === false) throw new Error('Playwright not installed. Run: npm install playwright && npx playwright install chromium');

  if (!browserInstance || !pageInstance) {
    try {
      const { chromium } = await import('playwright');
      playwrightAvailable = true;
      browserInstance = await (chromium as unknown as { launch: (opts: Record<string, unknown>) => Promise<unknown> })
        .launch({ headless: false, args: ['--no-sandbox'] });
      pageInstance = await (browserInstance as { newPage: () => Promise<unknown> }).newPage();
    } catch (err) {
      playwrightAvailable = false;
      throw new Error(`Browser unavailable: ${(err as Error).message}`);
    }
  }

  return { browser: browserInstance, page: pageInstance };
}

export async function executeBrowserAction(action: BrowserAction): Promise<BrowserResult> {
  const allowed = await permissionManager.check(
    'browserControl',
    'Browser',
    `Browser: ${action.action}${action.url ? ' ' + action.url : action.selector ? ' ' + action.selector : ''}`,
    action as unknown as Record<string, unknown>
  );
  if (!allowed) return { success: false, error: 'Permission denied' };

  try {
    const { page } = await ensureBrowser();
    const p = page as Record<string, (...args: unknown[]) => Promise<unknown>>;

    switch (action.action) {
      case 'navigate': {
        await p.goto(action.url!, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const title = await p.title();
        return { success: true, output: `Navigated to: ${action.url}\nTitle: ${title}` };
      }
      case 'click': {
        await p.click(action.selector!);
        return { success: true, output: `Clicked: ${action.selector}` };
      }
      case 'fill': {
        await p.fill(action.selector!, action.value!);
        return { success: true, output: `Filled ${action.selector}: ${action.value}` };
      }
      case 'screenshot': {
        const buf = await (page as { screenshot: (opts: Record<string, unknown>) => Promise<Buffer> })
          .screenshot({ type: 'png', fullPage: false });
        const b64 = buf.toString('base64');
        return { success: true, screenshot: b64, output: 'Screenshot captured' };
      }
      case 'evaluate': {
        const result = await p.evaluate(action.script!);
        return { success: true, output: JSON.stringify(result) };
      }
      case 'waitFor': {
        await p.waitForSelector(action.selector!, { timeout: 10000 });
        return { success: true, output: `Element found: ${action.selector}` };
      }
      case 'getText': {
        const text = await p.textContent(action.selector!);
        return { success: true, output: String(text || '') };
      }
      case 'getLinks': {
        const links = await (page as { evaluate: (fn: () => string[]) => Promise<string[]> })
          .evaluate(() => ([] as Array<{href:string;textContent:string|null}>).map((a) => `${(a as HTMLAnchorElement).href} — ${(a as HTMLAnchorElement).textContent?.trim()}`).slice(0, 50));
        return { success: true, output: links.join('\n') };
      }
      case 'scroll': {
        const delta = (action.amount || 500) * (action.direction === 'up' ? -1 : 1);
        await (page as { evaluate: (fn: (d: number) => void, delta: number) => Promise<void> }).evaluate((d) => window.scrollBy(0, d), delta);
        return { success: true, output: `Scrolled ${action.direction} by ${action.amount || 500}px` };
      }
      case 'submit': {
        await p.press(action.selector || 'body', 'Enter');
        return { success: true, output: 'Submitted form' };
      }
      case 'title': {
        const title = await p.title();
        return { success: true, output: String(title) };
      }
      case 'url': {
        const url = (page as { url: () => string }).url();
        return { success: true, output: url };
      }
      case 'back': {
        await p.goBack();
        return { success: true, output: 'Navigated back' };
      }
      case 'forward': {
        await p.goForward();
        return { success: true, output: 'Navigated forward' };
      }
      default:
        return { success: false, error: `Unknown action: ${(action as BrowserAction).action}` };
    }
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    try { await (browserInstance as { close: () => Promise<void> }).close(); } catch { /**/ }
    browserInstance = null;
    pageInstance = null;
  }
}

export function getBrowserToolDefinition(): Record<string, unknown> {
  return {
    name: 'Browser',
    description: 'Control a web browser. Navigate URLs, click elements, fill forms, take screenshots, run JavaScript. Use for web research, form submission, and automation.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['navigate', 'click', 'fill', 'screenshot', 'evaluate', 'waitFor', 'getText', 'getLinks', 'scroll', 'submit', 'title', 'url', 'back', 'forward'],
          description: 'The browser action to perform'
        },
        url:      { type: 'string', description: 'URL for navigate action' },
        selector: { type: 'string', description: 'CSS selector for click/fill/getText/waitFor' },
        value:    { type: 'string', description: 'Value for fill action' },
        script:   { type: 'string', description: 'JavaScript to evaluate' },
        direction:{ type: 'string', enum: ['up', 'down'], description: 'Scroll direction' },
        amount:   { type: 'number', description: 'Scroll amount in pixels' }
      },
      required: ['action']
    }
  };
}
