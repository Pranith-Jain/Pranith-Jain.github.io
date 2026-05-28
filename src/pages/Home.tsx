import { Hero, Contact } from '../components/sections';
import { LiveSignalStrip } from '../components/LiveSignalStrip';
import { RecentWriting } from '../components/RecentWriting';

export default function Home() {
  return (
    <>
      <Hero />
      <LiveSignalStrip />
      <RecentWriting />
      <Contact />
    </>
  );
}
