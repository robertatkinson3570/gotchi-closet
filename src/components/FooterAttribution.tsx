import { GRIMLABS_NAME, GRIMLABS_URL } from "@/lib/config";

type FooterAttributionProps = {
  className?: string;
  showLink?: boolean;
};

export function FooterAttribution({
  className,
  showLink = true,
}: FooterAttributionProps) {
  return (
    <footer className={className}>
      <div className="text-xs text-muted-foreground">
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
      </div>
    </footer>
  );
}

