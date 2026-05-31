import { useState, useEffect } from 'react';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, Dna, Search, Loader2, Users, ChevronRight, ChevronDown } from 'lucide-react';

interface ActorDNA {
  actor_id: string;
  actor_name: string;
  aliases: string[];
  ttp_signature: {
    preferred_initial_access: string[];
    preferred_execution: string[];
    persistence_patterns: string[];
    evasion_techniques: string[];
    c2_channels: string[];
    tooling_preferences: string[];
    opsec_patterns: string[];
  };
  infrastructure_dna: {
    hosting_preferences: string[];
    domain_patterns: string[];
    ssl_patterns: string[];
    dns_patterns: string[];
    ip_range_preferences: string[];
  };
  operational_tempo: {
    active_hours_utc: [number, number];
    active_days: string[];
    campaign_duration_avg_days: number;
    dwell_time_avg_days: number;
    seasonal_pattern: string;
    response_time_hours: number;
  };
  victimology: {
    preferred_sectors: string[];
    preferred_regions: string[];
    organization_size: string;
    data_types_targeted: string[];
    ransom_range: string;
  };
  first_seen: string;
  last_seen: string;
  confidence: number;
  sources: string[];
}

interface DNAMatch {
  actor_id: string;
  actor_name: string;
  match_score: number;
  matching_signals: Array<{ signal_type: string; description: string; weight: number }>;
  confidence: number;
}

export default function ActorDNA(): JSX.Element {
  const [actors, setActors] = useState<Array<{ actor_id: string; actor_name: string; aliases: string[] }>>([]);
  const [selectedActor, setSelectedActor] = useState<ActorDNA | null>(null);
  const [matchMode, setMatchMode] = useState(false);
  const [ttpsInput, setTtpsInput] = useState('');
  const [matches, setMatches] = useState<DNAMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['ttp', 'victimology']));

  useEffect(() => {
    fetchActors();
  }, []);

  const fetchActors = async () => {
    try {
      const res = await fetch('/api/v1/threat-intel/actor-dna');
      const data = await res.json();
      setActors(data.actors ?? []);
    } catch (err) {
      console.error('Failed to fetch actors:', err);
    }
  };

  const fetchActorDNA = async (actorId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/threat-intel/actor-dna/${actorId}`);
      const data = await res.json();
      setSelectedActor(data);
    } catch (err) {
      console.error('Failed to fetch actor DNA:', err);
    } finally {
      setLoading(false);
    }
  };

  const matchTTPs = async () => {
    if (!ttpsInput.trim()) return;
    setLoading(true);
    setMatches([]);
    try {
      const ttps = ttpsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch('/api/v1/threat-intel/actor-dna/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttps }),
      });
      const data = await res.json();
      setMatches(data.matches ?? []);
    } catch (err) {
      console.error('Failed to match TTPs:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="flex items-center gap-3 mb-6">
        <Dna className="w-8 h-8 text-brand-600 dark:text-brand-400" />
        <div>
          <h1 className="text-2xl font-display font-bold">Threat Actor Behavioral DNA</h1>
          <p className="text-slate-400 text-sm">Fingerprint actors by behavior, not just tools</p>
        </div>
      </div>

      {/* Mode Toggle */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setMatchMode(false)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            !matchMode
              ? 'bg-brand-600 text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          <Users className="w-4 h-4 inline mr-2" />
          Actor Profiles
        </button>
        <button
          onClick={() => setMatchMode(true)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            matchMode
              ? 'bg-brand-600 text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          <Dna className="w-4 h-4 inline mr-2" />
          DNA Matching
        </button>
      </div>

      {/* DNA Matching Mode */}
      {matchMode && (
        <div className="bg-white dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800 p-6 mb-6">
          <h2 className="font-semibold mb-4">Match TTPs to Actor DNA</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={ttpsInput}
              onChange={(e) => setTtpsInput(e.target.value)}
              placeholder="Enter TTPs (comma-separated): spearphishing, powershell, cobalt_strike"
              className="flex-1 bg-white dark:bg-slate-900/40 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500"
            />
            <button
              onClick={() => void matchTTPs()}
              disabled={loading}
              className="px-6 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:bg-slate-600 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Match
            </button>
          </div>

          {matches.length > 0 && (
            <div className="mt-4 space-y-3">
              <h3 className="text-sm font-medium text-slate-400">Matches ({matches.length})</h3>
              {matches.map((match) => (
                <div key={match.actor_id} className="bg-slate-50 dark:bg-slate-950 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{match.actor_name}</span>
                    <span className="text-sm px-2 py-0.5 bg-brand-500/20 text-brand-600 dark:text-brand-400 rounded">
                      {match.match_score}% match
                    </span>
                  </div>
                  <div className="space-y-1">
                    {match.matching_signals.map((signal, i) => (
                      <div key={i} className="text-xs text-slate-400">
                        • {signal.description}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actor List + Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Actor List */}
        <div className="bg-white dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
          <h2 className="font-semibold mb-4">Known Threat Actors ({actors.length})</h2>
          <div className="space-y-2">
            {actors.map((actor) => (
              <button
                key={actor.actor_id}
                onClick={() => fetchActorDNA(actor.actor_id)}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  selectedActor?.actor_id === actor.actor_id
                    ? 'bg-brand-600/20 border border-purple-500/30'
                    : 'bg-slate-50 dark:bg-slate-950 hover:bg-slate-700/50 border border-transparent'
                }`}
              >
                <div className="font-medium text-sm">{actor.actor_name}</div>
                <div className="text-xs text-slate-500 mt-1">{actor.aliases.slice(0, 3).join(', ')}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Actor Detail */}
        <div className="lg:col-span-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-brand-600 dark:text-brand-400" />
            </div>
          ) : selectedActor ? (
            <div className="space-y-4">
              {/* Header */}
              <div className="bg-white dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-bold">{selectedActor.actor_name}</h2>
                    <div className="text-sm text-slate-400 mt-1">{selectedActor.aliases.join(' · ')}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-brand-600 dark:text-brand-400">
                      {selectedActor.confidence}%
                    </div>
                    <div className="text-xs text-slate-500">Confidence</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                  <span>First seen: {selectedActor.first_seen}</span>
                  <span>•</span>
                  <span>Last seen: {selectedActor.last_seen}</span>
                </div>
              </div>

              {/* TTP Signature */}
              <div className="bg-white dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800">
                <button onClick={() => toggleSection('ttp')} className="w-full flex items-center justify-between p-4">
                  <span className="font-semibold">TTP Signature</span>
                  {expandedSections.has('ttp') ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>
                {expandedSections.has('ttp') && (
                  <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <DNACard
                      title="Initial Access"
                      items={selectedActor.ttp_signature.preferred_initial_access}
                      color="red"
                    />
                    <DNACard title="Execution" items={selectedActor.ttp_signature.preferred_execution} color="orange" />
                    <DNACard
                      title="Persistence"
                      items={selectedActor.ttp_signature.persistence_patterns}
                      color="yellow"
                    />
                    <DNACard title="Evasion" items={selectedActor.ttp_signature.evasion_techniques} color="green" />
                    <DNACard title="C2 Channels" items={selectedActor.ttp_signature.c2_channels} color="blue" />
                    <DNACard title="Tooling" items={selectedActor.ttp_signature.tooling_preferences} color="purple" />
                  </div>
                )}
              </div>

              {/* Victimology */}
              <div className="bg-white dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800">
                <button
                  onClick={() => toggleSection('victimology')}
                  className="w-full flex items-center justify-between p-4"
                >
                  <span className="font-semibold">Victimology</span>
                  {expandedSections.has('victimology') ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>
                {expandedSections.has('victimology') && (
                  <div className="px-4 pb-4 space-y-3">
                    <div>
                      <div className="text-xs text-slate-500 mb-2">Target Sectors</div>
                      <div className="flex flex-wrap gap-2">
                        {selectedActor.victimology.preferred_sectors.map((s, i) => (
                          <span
                            key={i}
                            className="text-sm px-3 py-1 bg-red-500/10 text-red-700 dark:text-red-400 rounded-full"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 mb-2">Target Regions</div>
                      <div className="flex flex-wrap gap-2">
                        {selectedActor.victimology.preferred_regions.map((r, i) => (
                          <span
                            key={i}
                            className="text-sm px-3 py-1 bg-blue-500/10 text-blue-700 dark:text-blue-400 rounded-full"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-3">
                      <div>
                        <div className="text-xs text-slate-500">Organization Size</div>
                        <div className="text-sm capitalize">{selectedActor.victimology.organization_size}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Ransom Range</div>
                        <div className="text-sm">{selectedActor.victimology.ransom_range}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Operational Tempo */}
              <div className="bg-white dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800">
                <button onClick={() => toggleSection('tempo')} className="w-full flex items-center justify-between p-4">
                  <span className="font-semibold">Operational Tempo</span>
                  {expandedSections.has('tempo') ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>
                {expandedSections.has('tempo') && (
                  <div className="px-4 pb-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <div className="text-xs text-slate-500">Active Hours (UTC)</div>
                      <div className="text-sm">
                        {selectedActor.operational_tempo.active_hours_utc[0]}:00 -{' '}
                        {selectedActor.operational_tempo.active_hours_utc[1]}:00
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Campaign Duration</div>
                      <div className="text-sm">
                        {selectedActor.operational_tempo.campaign_duration_avg_days} days avg
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Dwell Time</div>
                      <div className="text-sm">{selectedActor.operational_tempo.dwell_time_avg_days} days avg</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Response Time</div>
                      <div className="text-sm">{selectedActor.operational_tempo.response_time_hours} hours</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Seasonal Pattern</div>
                      <div className="text-sm capitalize">
                        {selectedActor.operational_tempo.seasonal_pattern.replace(/_/g, ' ')}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Infrastructure DNA */}
              <div className="bg-white dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800">
                <button onClick={() => toggleSection('infra')} className="w-full flex items-center justify-between p-4">
                  <span className="font-semibold">Infrastructure DNA</span>
                  {expandedSections.has('infra') ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>
                {expandedSections.has('infra') && (
                  <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <DNACard
                      title="Hosting"
                      items={selectedActor.infrastructure_dna.hosting_preferences}
                      color="cyan"
                    />
                    <DNACard
                      title="Domain Patterns"
                      items={selectedActor.infrastructure_dna.domain_patterns}
                      color="pink"
                    />
                    <DNACard
                      title="SSL Patterns"
                      items={selectedActor.infrastructure_dna.ssl_patterns}
                      color="indigo"
                    />
                    <DNACard title="DNS Patterns" items={selectedActor.infrastructure_dna.dns_patterns} color="teal" />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-12 text-slate-500">
              Select an actor to view their behavioral DNA
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DNACard({ title, items, color }: { title: string; items: string[]; color: string }) {
  const colorMap: Record<string, string> = {
    red: 'border-red-500/30 bg-red-500/5',
    orange: 'border-orange-500/30 bg-orange-500/5',
    yellow: 'border-yellow-500/30 bg-yellow-500/5',
    green: 'border-green-500/30 bg-green-500/5',
    blue: 'border-blue-500/30 bg-blue-500/5',
    purple: 'border-purple-500/30 bg-brand-500/5',
    cyan: 'border-cyan-500/30 bg-cyan-500/5',
    pink: 'border-pink-500/30 bg-pink-500/5',
    indigo: 'border-indigo-500/30 bg-indigo-500/5',
    teal: 'border-teal-500/30 bg-teal-500/5',
  };

  return (
    <div className={`rounded-lg border p-3 ${colorMap[color] ?? colorMap.blue}`}>
      <div className="text-xs font-medium text-slate-400 mb-2">{title}</div>
      <div className="flex flex-wrap gap-1">
        {items.map((item, i) => (
          <span
            key={i}
            className="text-xs px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded"
          >
            {item.replace(/_/g, ' ')}
          </span>
        ))}
      </div>
    </div>
  );
}
