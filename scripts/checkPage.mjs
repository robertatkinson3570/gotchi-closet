import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
await page.goto("http://localhost:5173/dress?address=0x1cf07f7c5853599dcaa5b3bb67ac0cf1ae7bdb82", { waitUntil: "networkidle" });
const url = page.url();
const hasCarousel = await page.$("[data-testid=gotchi-carousel]");
console.log("url", url);
console.log("hasCarousel", !!hasCarousel);
console.log("errors", errors);
await browser.close();
