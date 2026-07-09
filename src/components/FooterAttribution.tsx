import { GRIMLABS_NAME, GRIMLABS_URL } from "@/lib/config";

type FooterAttributionProps = {
  className?: string;
  showLink?: boolean;
};

const AAVEGOTCHI_DISCORD = "https://discord.com/invite/aavegotchi";
const AAVEGOTCHI_X = "https://x.com/aavegotchi?s=20";

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function FooterAttribution({
  className,
  showLink = true,
}: FooterAttributionProps) {
  return (
    <footer className={className}>
      <div className="flex items-center justify-center gap-3 mb-1.5">
        <a
          href={AAVEGOTCHI_DISCORD}
          target="_blank"
          rel="noreferrer"
          title="Aavegotchi Discord"
          aria-label="Aavegotchi Discord"
          className="text-muted-foreground hover:text-primary transition-colors"
        >
          <DiscordIcon className="w-4 h-4" />
        </a>
        <a
          href={AAVEGOTCHI_X}
          target="_blank"
          rel="noreferrer"
          title="Aavegotchi on X"
          aria-label="Aavegotchi on X"
          className="text-muted-foreground hover:text-primary transition-colors"
        >
          <XIcon className="w-3.5 h-3.5" />
        </a>
      </div>
      <div className="flex items-center justify-center gap-2.5 text-xs text-muted-foreground">
        <span>
          Built by{" "}
          {showLink ? (
            <a
              href={GRIMLABS_URL}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              {GRIMLABS_NAME}
            </a>
          ) : (
            <span>{GRIMLABS_NAME}</span>
          )}
        </span>
        <a
          href="https://sitecrawliq.com/"
          target="_blank"
          rel="noreferrer"
          title="SEO audited & verified by SiteCrawlIQ"
          className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-500 hover:bg-emerald-500/20 transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3" aria-hidden="true">
            <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
          SiteCrawlIQ Verified
        </a>
      </div>
    </footer>
  );
}
