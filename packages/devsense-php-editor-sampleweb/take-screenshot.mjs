import { chromium } from '@playwright/test';

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // Capture console errors
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
    console.log(`CONSOLE [${msg.type()}]: ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    console.log('PAGE ERROR:', err.message);
  });

  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 30000 });

  // Wait for Monaco editor to render
  try {
    await page.waitForSelector('.monaco-editor', { timeout: 20000 });
    console.log('Monaco editor rendered successfully');
  } catch (e) {
    console.log('Monaco editor not found:', e.message);
  }

  // Wait a bit more for full render
  await page.waitForTimeout(3000);

  // Take full-page screenshot
  await page.screenshot({ path: 'screenshot.png', fullPage: true });
  console.log('Screenshot saved');

  // Report any console errors
  if (consoleErrors.length > 0) {
    console.log(`${consoleErrors.length} console errors captured:`);
    consoleErrors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
  } else {
    console.log('No console errors');
  }

  await browser.close();
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
