import { PageMeta } from '../components/PageMeta';
import { RevealSection } from '../components/RevealSection';
import { Hero } from '../components/sections/Hero';
import { Contact } from '../components/sections/Contact';
import { Toolkits } from '../components/sections/Toolkits';
import { personalInfo } from '../data/content';

/**
 * Portfolio home — served on the apex host.
 *
 * Deliberately a portfolio, not a dashboard. The live platform widgets
 * (LiveSignalStrip, LatestBriefingCard, GlobalPulseCard, FeedHealthBadge,
 * RecentWriting, QuoteOfTheDay, ToolOfTheDay, PageToCheckOut) moved to
 * `pages/tools/ToolsHome`, which the tools surface serves. About / Skills /
 * Experience / Projects stay on their own routes so this page never duplicates
 * content the sitemap already lists.
 */
export default function Home() {
  return (
    <>
      <PageMeta
        title="Home"
        description="Pranith Jain — Security Analyst & Detection Engineer. Experience, security toolkits and ways to get in touch."
        canonicalPath="/"
      />
      <Hero personalInfo={personalInfo} />

      {/* Products - the toolkits are the substance of the portfolio. */}
      <RevealSection className="mt-16">
        <Toolkits />
      </RevealSection>

      <RevealSection className="mt-20">
        <Contact personalInfo={personalInfo} />
      </RevealSection>
    </>
  );
}
