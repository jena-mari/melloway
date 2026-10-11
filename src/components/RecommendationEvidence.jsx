import { cleanEvidence } from '../engine/recommendationEvidence.js';
export default function RecommendationEvidence({ venue }) {
  const evidence = cleanEvidence(venue.recommendationEvidence);
  if (!evidence.length) return null;
  return <details className="plan-disclosure">
    <summary>why this spot</summary>
    <ul>{evidence.map(item => <li key={item.url}>
      <a href={item.url} target="_blank" rel="noopener noreferrer">{new URL(item.url).hostname.replace(/^www\./, '')} ↗</a>
      {item.summary && <span> · {item.summary}</span>}
    </li>)}</ul>
  </details>;
}
