import { Hero, Featured, Memberships, Contact } from '../components/sections';
import { LiveSignalStrip } from '../components/LiveSignalStrip';
import { RecentWriting } from '../components/RecentWriting';
import { portfolioRepository } from '../infrastructure/repositories';
import { getProfileData } from '../core/use-cases';

const { personalInfo } = getProfileData(portfolioRepository);
const featuredArticles = portfolioRepository.getFeaturedArticles();
const memberships = portfolioRepository.getMemberships();

export default function Home() {
  return (
    <>
      <Hero personalInfo={personalInfo} />
      <LiveSignalStrip />
      <RecentWriting />
      <Featured featuredArticles={featuredArticles} />
      <Memberships memberships={memberships} />
      <Contact personalInfo={personalInfo} />
    </>
  );
}
