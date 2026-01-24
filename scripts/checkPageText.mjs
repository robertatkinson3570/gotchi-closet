import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("http://localhost:5173/dress?address=0x1cf07f7c5853599dcaa5b3bb67ac0cf1ae7bdb82", { waitUntil: "networkidle" });
const bodyText = await page.textContent('body');
console.log(bodyText.slice(0, 200));
await browser.close();
