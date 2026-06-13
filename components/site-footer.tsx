import { Wordmark } from "@/components/top-bar";

// Presentational footer. Server component (no hooks) so it can be dropped
// anywhere. Renders as a dark rounded card (see .canary-footer in canary.css)
// that extends wider than the content column. A large Radley tagline sits on
// top, with the canary wordmark and three equal-size icon links below.
export function SiteFooter() {
  return (
    <footer className="canary-footer">
      <div className="canary-footer-tagline">Ready to hedge onchain risk?</div>

      <div className="canary-footer-bottom">
        <Wordmark size="small" />

        <div className="canary-footer-links">
          <a
            href="https://github.com/carluzh/canary"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Canary on GitHub"
          >
            <svg
              className="canary-footer-icon"
              width={20}
              height={20}
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden
            >
              <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.27-.01-1.16-.02-2.1-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.03 11.03 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.79-.01 3.17 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z" />
            </svg>
          </a>
          <a
            href="https://x.com"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Canary on X"
          >
            <svg
              className="canary-footer-icon"
              width={20}
              height={20}
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden
            >
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817-5.967 6.817H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644z" />
            </svg>
          </a>
          <a
            href="#"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Canary docs"
          >
            <svg
              className="canary-footer-icon"
              width={20}
              height={20}
              viewBox="0 0 20 20"
              aria-hidden
            >
              <polygon
                points="7 3 13 3 13 11 10 8 7 11 7 3"
                fill="currentColor"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
              />
              <rect
                x="3"
                y="3"
                width="14"
                height="14"
                rx="3"
                ry="3"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
              />
            </svg>
          </a>
        </div>
      </div>
    </footer>
  );
}
