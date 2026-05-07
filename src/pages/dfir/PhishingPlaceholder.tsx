import { ComingSoon } from './ComingSoon';

export default function PhishingPlaceholder(): JSX.Element {
  return (
    <ComingSoon
      title="Phishing Email Analyzer"
      description="Paste raw email source. We parse SPF, DKIM, DMARC, headers, URLs, and attachment hashes to score phishing risk."
    />
  );
}
