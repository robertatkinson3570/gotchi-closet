import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (err) => console.log('pageerror', err.message));
page.on('console', (msg) => { if (msg.type() === 'error') console.log('console', msg.text()); });
await page.goto("http://localhost:5173/dress?address=0x1cf07f7c5853599dcaa5b3bb67ac0cf1ae7bdb82", { waitUntil: "networkidle" });
const hasCarousel = await page.$("[data-testid=gotchi-carousel]");
console.log('hasCarousel', !!hasCarousel);
await browser.close();
