import { ComingSoon } from './ComingSoon';

export default function DashboardPlaceholder(): JSX.Element {
  return (
    <ComingSoon
      title="Recent Lookups"
      description="Your last 20 lookups, kept anonymously via a browser cookie. No login required."
    />
  );
}
