import Link from "next/link";
import { BrowserMockup } from "@/components/landing/browser-mockup";
import { Reveal } from "@/components/landing/reveal";
import { HiglouMarkIcon } from "@/components/brand/higlou-logo";
import styles from "@/components/landing/landing.module.css";

const START_HREF = "/login?redirect=/listings/new";
const SIGN_IN_HREF = "/login?redirect=/home";

const FLOW = [
  {
    n: "01",
    title: "Upload photos",
    body: "Drop a few clear angles. Higlou reads what buyers need to see.",
  },
  {
    n: "02",
    title: "AI drafts the listing",
    body: "Title, category, specifics, and description — assembled in seconds.",
  },
  {
    n: "03",
    title: "Review with confidence",
    body: "Approve what looks right. Adjust price. Leave the rest.",
  },
  {
    n: "04",
    title: "Export CSV",
    body: "Download an eBay-ready CSV and publish the same listing to your marketplace.",
  },
] as const;

export function LandingPage() {
  return (
    <div className={styles.root}>
      <div className={styles.radial} aria-hidden="true" />

      <header className={styles.nav}>
        <div className={styles.navInner}>
          <Link href="/" className={styles.brand} aria-label="Higlou home">
            <HiglouMarkIcon size={28} />
            Higlou
          </Link>

          <nav className={styles.navLinks} aria-label="Primary">
            <a href="#how">How it works</a>
            <a href="#pricing" title="Pricing coming soon">
              Pricing <span className={styles.soon}>soon</span>
            </a>
          </nav>

          <div className={styles.navActions}>
            <Link href={SIGN_IN_HREF} className={styles.linkQuiet}>
              Log in
            </Link>
            <Link href={START_HREF} className={styles.btnDark}>
              Start
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className={styles.hero} aria-label="Higlou introduction">
          <div className={styles.heroCopy}>
            <p className={`${styles.kicker} ${styles.enter} ${styles.d1}`}>
              Product analysis → perfect CSV
            </p>

            <h1 className={`${styles.headline} ${styles.enter} ${styles.d2}`}>
              <span>From photos</span>
              <span>to professional</span>
              <span>listings</span>
              <span className={styles.headlineSoft}>in under a minute.</span>
            </h1>

            <p className={`${styles.lede} ${styles.enter} ${styles.d3}`}>
              Your AI listing team. Calm precision, not busywork.
            </p>

            <div className={`${styles.ctaRow} ${styles.enter} ${styles.d4}`}>
              <Link href={START_HREF} className={styles.btnDarkLg}>
                Start for free
              </Link>
              <a href="#how" className={styles.btnGhost}>
                See how it works
              </a>
            </div>

            <div className={`${styles.trust} ${styles.enter} ${styles.d5}`}>
              <span className={styles.stars} aria-label="Five stars">
                ★★★★★
              </span>
              <p>95% average confidence score · Built for eBay sellers</p>
            </div>
          </div>

          <div className={`${styles.heroVisual} ${styles.enter} ${styles.d3}`}>
            <BrowserMockup />
          </div>
        </section>

        <section id="how" className={styles.flow} aria-labelledby="flow-heading">
          <Reveal>
            <p className={styles.sectionLabel}>The flow</p>
            <h2 id="flow-heading" className={styles.sectionTitle}>
              Four steps. Nothing extra.
            </h2>
          </Reveal>

          <ol className={styles.flowList}>
            {FLOW.map((step, i) => (
              <Reveal key={step.n} delayMs={i * 80} as="li" className={styles.flowItem}>
                <span className={styles.flowIndex}>{step.n}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </section>

        <section
          id="pricing"
          className={styles.closing}
          aria-labelledby="closing-heading"
        >
          <Reveal className={styles.closingInner}>
            <p className={styles.sectionLabel}>Ready when you are</p>
            <h2 id="closing-heading" className={styles.closingTitle}>
              Sell more.
              <br />
              <em>Work less.</em>
            </h2>
            <p className={styles.closingLede}>
              Upload photos. Walk out with a professional draft.
            </p>
            <Link href={START_HREF} className={styles.btnDarkLg}>
              Start for free
            </Link>
            <p className={styles.closingFine}>
              Pricing available soon · No clutter. Just listings.
            </p>
          </Reveal>
        </section>
      </main>

      <footer className={styles.footer}>
        <span>© {new Date().getFullYear()} Higlou</span>
        <Link href={SIGN_IN_HREF}>Log in</Link>
      </footer>
    </div>
  );
}
