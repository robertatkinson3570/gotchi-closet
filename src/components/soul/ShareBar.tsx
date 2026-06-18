import { useState } from "react";

interface ShareBarProps {
  url: string;
  text: string;
}

export function ShareBar({ url, text }: ShareBarProps) {
  const [copied, setCopied] = useState(false);

  function handleTweet() {
    const tweetUrl =
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(tweetUrl, "_blank", "noopener");
  }

  function handleCopy() {
    if (!navigator.clipboard) {
      // Graceful fallback for environments without clipboard API
      return;
    }
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleTweet}
        className="flex items-center gap-1.5 rounded-lg border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 active:bg-purple-500/30 transition-colors px-3 py-1.5 text-xs font-semibold text-purple-300 hover:text-purple-200"
      >
        {/* X / Twitter bird icon */}
        <svg
          viewBox="0 0 24 24"
          className="w-3.5 h-3.5 fill-current shrink-0"
          aria-hidden="true"
        >
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        Tweet
      </button>

      <button
        onClick={handleCopy}
        className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 active:bg-cyan-500/30 transition-colors px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:text-cyan-200"
      >
        {copied ? (
          <>
            <svg
              viewBox="0 0 24 24"
              className="w-3.5 h-3.5 fill-none stroke-current shrink-0"
              strokeWidth={2.5}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            Copied!
          </>
        ) : (
          <>
            <svg
              viewBox="0 0 24 24"
              className="w-3.5 h-3.5 fill-none stroke-current shrink-0"
              strokeWidth={2}
              aria-hidden="true"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
              />
            </svg>
            Copy link
          </>
        )}
      </button>
    </div>
  );
}
