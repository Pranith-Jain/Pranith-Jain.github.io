import { useState, useEffect, useMemo, useCallback } from 'react';
import { Shield, Search, X, ExternalLink, Lock, ChevronDown, ChevronUp } from 'lucide-react';

interface TaxonomyNode {
  id: string;
  code: string;
  title: string;
  description: string;
  delivery: 'direct' | 'indirect' | 'both';
  local?: boolean;
  aliases?: string[];
  ideas?: string[];
  examples?: string[];
}

interface TaxonomyData {
  intents: TaxonomyNode[];
  techniques: TaxonomyNode[];
  evasions: TaxonomyNode[];
  inputs: TaxonomyNode[];
}

type Category = 'intents' | 'techniques' | 'evasions' | 'inputs';

const CAT_META: Record<
  Category,
  {
    label: string;
    title: string;
    subtitle: string;
    bg: string;
    border: string;
    text: string;
    textSec: string;
    badgeBg: string;
    badgeBorder: string;
    badgeText: string;
    shadow: string;
  }
> = {
  techniques: {
    label: 'Technique',
    title: 'Attack Techniques',
    subtitle: 'Methods used to execute prompt injection attacks',
    bg: 'rgba(249,115,22,0.1)',
    border: 'rgba(249,115,22,0.3)',
    text: '#f97316',
    textSec: '#fb923c',
    badgeBg: 'rgba(249,115,22,0.1)',
    badgeBorder: 'rgba(249,115,22,0.3)',
    badgeText: '#f97316',
    shadow: '0 0 20px rgba(249,115,22,0.2)',
  },
  evasions: {
    label: 'Evasion',
    title: 'Attack Evasions',
    subtitle: 'Obfuscation methods to avoid detection',
    bg: 'rgba(139,92,246,0.1)',
    border: 'rgba(139,92,246,0.3)',
    text: '#8b5cf6',
    textSec: '#a78bfa',
    badgeBg: 'rgba(139,92,246,0.1)',
    badgeBorder: 'rgba(139,92,246,0.3)',
    badgeText: '#8b5cf6',
    shadow: '0 0 20px rgba(139,92,246,0.2)',
  },
  intents: {
    label: 'Intent',
    title: 'Attack Intents',
    subtitle: 'Goals and objectives of prompt injection attacks',
    bg: 'rgba(239,68,68,0.1)',
    border: 'rgba(239,68,68,0.3)',
    text: '#ef4444',
    textSec: '#f87171',
    badgeBg: 'rgba(239,68,68,0.1)',
    badgeBorder: 'rgba(239,68,68,0.3)',
    badgeText: '#ef4444',
    shadow: '0 0 20px rgba(239,68,68,0.2)',
  },
  inputs: {
    label: 'Input',
    title: 'Attack Inputs',
    subtitle: 'Attack surfaces and input vectors for injection',
    bg: 'rgba(20,184,166,0.1)',
    border: 'rgba(20,184,166,0.3)',
    text: '#14b8a6',
    textSec: '#2dd4bf',
    badgeBg: 'rgba(20,184,166,0.1)',
    badgeBorder: 'rgba(20,184,166,0.3)',
    badgeText: '#14b8a6',
    shadow: '0 0 20px rgba(20,184,166,0.2)',
  },
};

const DELIVERY_DOT: Record<string, string> = {
  direct: '#22c55e',
  indirect: '#eab308',
  both: 'linear-gradient(90deg, #22c55e 0 50%, #eab308 50% 100%)',
};

const SECTION_ICONS: Record<Category, string> = {
  intents: '◎',
  techniques: '⚒',
  evasions: '⛨',
  inputs: '✉',
};

export default function PiTaxonomy() {
  const [data, setData] = useState<TaxonomyData | null>(null);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<Category | 'all'>('all');
  const [selectedNode, setSelectedNode] = useState<{ category: Category; node: TaxonomyNode } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/data/pi-taxonomy/taxonomy.json')
      .then((res) => res.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filteredNodes = useMemo(() => {
    if (!data) return [];
    const cats: Category[] = ['intents', 'techniques', 'evasions', 'inputs'];
    const results: { category: Category; node: TaxonomyNode }[] = [];
    for (const cat of cats) {
      if (activeCategory !== 'all' && activeCategory !== cat) continue;
      for (const node of data[cat]) {
        const q = search.toLowerCase();
        const ok =
          !q ||
          node.title.toLowerCase().includes(q) ||
          node.description.toLowerCase().includes(q) ||
          node.code.toLowerCase().includes(q) ||
          node.aliases?.some((a) => a.toLowerCase().includes(q));
        if (ok) results.push({ category: cat, node });
      }
    }
    return results;
  }, [data, search, activeCategory]);

  const stats = useMemo(() => {
    if (!data) return { total: 0, intents: 0, techniques: 0, evasions: 0, inputs: 0 };
    return {
      total: data.intents.length + data.techniques.length + data.evasions.length + data.inputs.length,
      intents: data.intents.length,
      techniques: data.techniques.length,
      evasions: data.evasions.length,
      inputs: data.inputs.length,
    };
  }, [data]);

  const openModal = useCallback((cat: Category, node: TaxonomyNode) => setSelectedNode({ category: cat, node }), []);

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #0e0b14 0%, #1a1130 55%, #241640 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#8b7cae',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        Loading taxonomy…
      </div>
    );
  }

  const cats: Category[] = ['intents', 'techniques', 'evasions', 'inputs'];

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0e0b14 0%, #1a1130 55%, #241640 100%)',
        backgroundAttachment: 'fixed',
        fontFamily: 'Inter, -apple-system, sans-serif',
        color: '#ece8f5',
        overflowX: 'hidden',
      }}
    >
      {/* Background grid */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(153,102,204,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(153,102,204,0.05) 1px,transparent 1px)',
          backgroundSize: '30px 30px',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Header */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          backdropFilter: 'blur(10px)',
          background:
            'linear-gradient(90deg, rgba(86,41,151,0.30),rgba(186,37,138,0.22)),linear-gradient(180deg, #150f22 0%, rgba(14,11,20,0.85) 100%)',
          borderBottom: '1px solid #2e2247',
          padding: '2rem 2rem 1.5rem',
        }}
      >
        <div
          style={{
            maxWidth: 1400,
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1.5rem',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.65rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Shield size={36} color="#BA258A" />
              <div>
                <h1
                  style={{
                    fontSize: '1.4rem',
                    fontWeight: 700,
                    letterSpacing: '-0.02em',
                    background: 'linear-gradient(135deg, #ece8f5 0%, #b79de0 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    margin: 0,
                  }}
                >
                  Prompt Injection Taxonomy{' '}
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '0.6rem',
                      fontWeight: 600,
                      letterSpacing: '0.04em',
                      color: '#9966CC',
                      WebkitTextFillColor: '#9966CC',
                      verticalAlign: 'super',
                      border: '1px solid #3a2e57',
                      borderRadius: 6,
                      padding: '0.05rem 0.35rem',
                      marginLeft: 6,
                    }}
                  >
                    v1.6.1
                  </span>
                </h1>
                <p style={{ fontSize: '0.875rem', color: '#8b7cae', marginTop: 2 }}>
                  Attack Classification System for AI red teaming and penetration testing.
                </p>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            {[
              { key: 'total' as const, label: 'Total Entries', color: '#ece8f5', bg: '#16102a' },
              {
                key: 'intents' as const,
                label: 'Intents',
                color: '#ef4444',
                bg: 'rgba(239,68,68,0.1)',
                bc: 'rgba(239,68,68,0.3)',
              },
              {
                key: 'techniques' as const,
                label: 'Techniques',
                color: '#f97316',
                bg: 'rgba(249,115,22,0.1)',
                bc: 'rgba(249,115,22,0.3)',
              },
              {
                key: 'evasions' as const,
                label: 'Evasions',
                color: '#8b5cf6',
                bg: 'rgba(139,92,246,0.1)',
                bc: 'rgba(139,92,246,0.3)',
              },
              {
                key: 'inputs' as const,
                label: 'Inputs',
                color: '#14b8a6',
                bg: 'rgba(20,184,166,0.1)',
                bc: 'rgba(20,184,166,0.3)',
              },
            ].map((s) => (
              <div
                key={s.key}
                style={{
                  textAlign: 'center',
                  padding: '0.5rem 1rem',
                  background: s.bg,
                  borderRadius: 10,
                  border: `1px solid ${s.bc || '#2e2247'}`,
                  minWidth: 80,
                }}
              >
                <span
                  style={{
                    display: 'block',
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    fontFamily: "'JetBrains Mono', monospace",
                    color: s.color,
                  }}
                >
                  {stats[s.key]}
                </span>
                <span
                  style={{ fontSize: '0.75rem', color: '#8b7cae', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                >
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* Filter bar */}
      <nav
        style={{
          background: '#150f22',
          borderBottom: '1px solid #2e2247',
          padding: '1rem 2rem',
          position: 'sticky',
          top: 0,
          zIndex: 99,
        }}
      >
        <div
          style={{
            maxWidth: 1400,
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
            <Search
              size={18}
              color="#8b7cae"
              style={{
                position: 'absolute',
                left: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search taxonomy…"
              style={{
                width: '100%',
                padding: '0.75rem 1rem 0.75rem 2.75rem',
                background: '#16102a',
                border: '1px solid #2e2247',
                borderRadius: 10,
                color: '#ece8f5',
                fontSize: '0.9rem',
                fontFamily: 'Inter, sans-serif',
                outline: 'none',
                transition: 'border-color 150ms, box-shadow 150ms',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#06b6d4';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(6,182,212,0.1)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#2e2247';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <FilterBtn
              label="All"
              count={stats.total}
              active={activeCategory === 'all'}
              onClick={() => setActiveCategory('all')}
              activeColor="#06b6d4"
            />
            {cats.map((c) => (
              <FilterBtn
                key={c}
                label={CAT_META[c].label + 's'}
                count={stats[c]}
                active={activeCategory === c}
                onClick={() => setActiveCategory(c)}
                activeColor={CAT_META[c].text}
                dotColor={CAT_META[c].text}
              />
            ))}
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '2rem', position: 'relative', zIndex: 1 }}>
        {/* Legend */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '1.25rem',
            marginBottom: '1.5rem',
            fontSize: '0.72rem',
            color: '#8b7cae',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 11,
                height: 11,
                borderRadius: '50%',
                background: '#22c55e',
                border: '1px solid rgba(0,0,0,0.25)',
                display: 'inline-block',
              }}
            />{' '}
            Direct delivery
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 11,
                height: 11,
                borderRadius: '50%',
                background: '#eab308',
                border: '1px solid rgba(0,0,0,0.25)',
                display: 'inline-block',
              }}
            />{' '}
            Indirect delivery
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 11,
                height: 11,
                borderRadius: '50%',
                background: 'linear-gradient(90deg, #22c55e 0 50%, #eab308 50% 100%)',
                border: '1px solid rgba(0,0,0,0.25)',
                display: 'inline-block',
              }}
            />{' '}
            Either
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.62rem',
                fontWeight: 700,
                letterSpacing: '0.06em',
                color: '#f59e0b',
                border: '1px solid #f59e0b',
                borderRadius: 6,
                padding: '0.1rem 0.35rem',
                background: 'rgba(245,158,11,0.12)',
              }}
            >
              LOCAL
            </span>{' '}
            Requires local model-weight access
          </span>
        </div>

        {/* Sections */}
        {activeCategory === 'all' ? (
          cats.map((c) => (
            <section key={c} style={{ marginBottom: '3rem' }}>
              <SectionHeader cat={c} />
              <div
                style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}
              >
                {data![c].map((node) => (
                  <Card key={node.code} cat={c} node={node} onClick={() => openModal(c, node)} />
                ))}
              </div>
            </section>
          ))
        ) : (
          <section style={{ marginBottom: '3rem' }}>
            <SectionHeader cat={activeCategory} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
              {filteredNodes.map(({ category, node }) => (
                <Card key={node.code} cat={category} node={node} onClick={() => openModal(category, node)} />
              ))}
            </div>
          </section>
        )}

        {filteredNodes.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#8b7cae' }}>No results for "{search}"</div>
        )}
      </main>

      {/* Footer */}
      <footer style={{ background: '#150f22', borderTop: '1px solid #2e2247', padding: '2rem', marginTop: '2rem' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem',
            }}
          >
            <div>
              <p style={{ fontSize: '0.875rem', color: '#b6a8d0' }}>
                Based on the{' '}
                <a
                  href="https://github.com/Arcanum-Sec/arc_pi_taxonomy"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#06b6d4', textDecoration: 'none' }}
                >
                  Arcanum PI Taxonomy
                </a>
              </p>
              <p style={{ fontSize: '0.75rem', color: '#8b7cae', marginTop: 4 }}>
                Created by Jason Haddix & Arcanum Information Security
              </p>
            </div>
            <a
              href="https://github.com/Arcanum-Sec/arc_pi_taxonomy"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '0.625rem 1rem',
                background: '#16102a',
                border: '1px solid #2e2247',
                borderRadius: 10,
                color: '#b6a8d0',
                textDecoration: 'none',
                fontSize: '0.875rem',
                fontWeight: 500,
                transition: 'all 150ms',
              }}
            >
              <ExternalLink size={18} /> View on GitHub
            </a>
          </div>
          <div
            style={{
              marginTop: '1.5rem',
              paddingTop: '1.25rem',
              borderTop: '1px solid #2e2247',
              fontSize: '0.78rem',
              lineHeight: 1.55,
              color: '#8b7cae',
            }}
          >
            <p style={{ margin: '0 0 0.4rem' }}>
              The Arcanum Prompt Injection Taxonomy is licensed under{' '}
              <a
                href="https://creativecommons.org/licenses/by/4.0/"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#06b6d4' }}
              >
                CC BY 4.0
              </a>
              .
            </p>
            <p style={{ margin: '0 0 0.4rem' }}>
              <strong style={{ color: '#b6a8d0' }}>Required attribution:</strong> Based on the Arcanum Prompt Injection
              Taxonomy by Jason Haddix, Arcanum Information Security (arcanum-sec.com).
            </p>
            <p style={{ margin: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.72rem' }}>
              <strong style={{ color: '#b6a8d0' }}>How to cite:</strong> Haddix, J. (2026).{' '}
              <em>Arcanum Prompt Injection Taxonomy</em> (v1.6.1). Arcanum Information Security.
              https://www.arcanum-sec.com/pitax
            </p>
          </div>
        </div>
      </footer>

      {/* Modal */}
      {selectedNode && (
        <DetailModal category={selectedNode.category} node={selectedNode.node} onClose={() => setSelectedNode(null)} />
      )}
    </div>
  );
}

function FilterBtn({
  label,
  count,
  active,
  onClick,
  activeColor,
  dotColor,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  activeColor: string;
  dotColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '0.625rem 1rem',
        borderRadius: 10,
        fontSize: '0.875rem',
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'all 150ms',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: active ? activeColor : '#16102a',
        border: `1px solid ${active ? activeColor : '#2e2247'}`,
        color: active ? '#0e0b14' : '#b6a8d0',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {dotColor && <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor }} />}
      {label} ({count})
    </button>
  );
}

function SectionHeader({ cat }: { cat: Category }) {
  const m = CAT_META[cat];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        marginBottom: '1.5rem',
        paddingBottom: '1rem',
        borderBottom: '1px solid #2e2247',
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: m.bg,
          border: `1px solid ${m.border}`,
          color: m.text,
          fontSize: '1.25rem',
        }}
      >
        {SECTION_ICONS[cat]}
      </div>
      <div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 4 }}>{m.title}</h2>
        <p style={{ fontSize: '0.875rem', color: '#8b7cae' }}>{m.subtitle}</p>
      </div>
    </div>
  );
}

function Card({ cat, node, onClick }: { cat: Category; node: TaxonomyNode; onClick: () => void }) {
  const m = CAT_META[cat];
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? m.bg : '#16102a',
        border: '1px solid',
        borderColor: hover ? '#3a2e57' : '#2e2247',
        borderLeft: `3px solid ${m.text}`,
        borderRadius: 16,
        padding: '1.25rem',
        cursor: 'pointer',
        transition: 'all 250ms',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: hover ? m.shadow : 'none',
        transform: hover ? 'translateY(-2px)' : 'none',
      }}
    >
      {/* Top gradient line */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: `linear-gradient(90deg, ${m.text}, transparent)`,
          opacity: hover ? 1 : 0,
          transition: 'opacity 150ms',
        }}
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '0.75rem',
          marginBottom: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.7rem',
              fontWeight: 500,
              letterSpacing: '0.08em',
              color: '#06b6d4',
              opacity: 0.85,
            }}
          >
            {node.code}
          </span>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, lineHeight: 1.3, color: m.textSec, margin: 0 }}>
            {node.title}
          </h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {node.local && (
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.62rem',
                fontWeight: 700,
                letterSpacing: '0.06em',
                color: '#f59e0b',
                border: '1px solid #f59e0b',
                borderRadius: 6,
                padding: '0.1rem 0.35rem',
                background: 'rgba(245,158,11,0.12)',
                whiteSpace: 'nowrap',
              }}
            >
              <Lock size={9} style={{ marginRight: 3, verticalAlign: 'middle' }} />
              LOCAL
            </span>
          )}
          <span
            style={{
              width: 11,
              height: 11,
              borderRadius: '50%',
              background: DELIVERY_DOT[node.delivery] || DELIVERY_DOT.both,
              border: '1px solid rgba(0,0,0,0.25)',
              display: 'inline-block',
              flexShrink: 0,
            }}
          />
        </div>
      </div>

      <p
        style={{
          fontSize: '0.875rem',
          color: '#b6a8d0',
          lineHeight: 1.5,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          margin: 0,
        }}
      >
        {node.description}
      </p>

      {node.aliases && node.aliases.length > 0 && (
        <p
          style={{
            marginTop: '0.6rem',
            fontSize: '0.75rem',
            lineHeight: 1.4,
            color: '#8b7cae',
            fontFamily: "'JetBrains Mono', monospace",
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              fontSize: '0.65rem',
              fontWeight: 600,
              color: '#06b6d4',
              marginRight: 6,
            }}
          >
            aka
          </span>
          {node.aliases.join(' · ')}
        </p>
      )}

      <div
        style={{
          marginTop: '1rem',
          paddingTop: '0.75rem',
          borderTop: '1px solid #2e2247',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: '0.75rem', color: '#8b7cae', display: 'flex', alignItems: 'center', gap: 4 }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          {node.ideas ? node.ideas.length : 0} ideas
        </span>
        {cat !== 'inputs' && (
          <span style={{ fontSize: '0.75rem', color: '#8b7cae', display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <path d="M14 2v6h6" />
              <path d="M16 13H8M16 17H8M10 9H8" />
            </svg>
            {node.examples ? node.examples.length : 0} prompts
          </span>
        )}
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 500,
            color: '#06b6d4',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            opacity: hover ? 1 : 0,
            transform: hover ? 'translateX(0)' : 'translateX(-5px)',
            transition: 'all 150ms',
          }}
        >
          View <ArrowIcon />
        </span>
      </div>
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

function DetailModal({ category, node, onClose }: { category: Category; node: TaxonomyNode; onClose: () => void }) {
  const m = CAT_META[category];
  const [showExamples, setShowExamples] = useState(true);
  const [showIdeas, setShowIdeas] = useState(true);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.8)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '2rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#150f22',
          border: '1px solid #2e2247',
          borderRadius: 16,
          width: '100%',
          maxWidth: 600,
          maxHeight: '80vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ position: 'relative', padding: '1.5rem 1.5rem 1rem', borderBottom: '1px solid #2e2247' }}>
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              width: 36,
              height: 36,
              background: '#16102a',
              border: '1px solid #2e2247',
              borderRadius: 6,
              color: '#b6a8d0',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 150ms',
            }}
          >
            <X size={18} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <span
              style={{
                display: 'inline-block',
                fontSize: '0.75rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                padding: '0.25rem 0.75rem',
                borderRadius: 6,
                background: m.bg,
                color: m.text,
                border: `1px solid ${m.border}`,
              }}
            >
              {m.label}
            </span>
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.8rem',
                fontWeight: 500,
                letterSpacing: '0.08em',
                color: '#06b6d4',
                border: '1px solid #3a2e57',
                borderRadius: 6,
                padding: '0.15rem 0.5rem',
              }}
            >
              {node.code}
            </span>
            <span
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: '#b6a8d0' }}
            >
              <span
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: '50%',
                  background: DELIVERY_DOT[node.delivery],
                  border: '1px solid rgba(0,0,0,0.25)',
                }}
              />
              {node.delivery === 'direct' ? 'Direct' : node.delivery === 'indirect' ? 'Indirect' : 'Either'}
            </span>
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, paddingRight: '2.5rem' }}>{node.title}</h2>
        </div>

        {/* Body */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
          {node.local && (
            <div
              style={{
                display: 'flex',
                gap: '0.7rem',
                alignItems: 'flex-start',
                background: 'rgba(245,158,11,0.1)',
                border: '1px solid #f59e0b',
                borderRadius: 10,
                padding: '0.85rem 1rem',
                marginBottom: '1.25rem',
                fontSize: '0.85rem',
                lineHeight: 1.55,
                color: '#b6a8d0',
              }}
            >
              <Lock size={20} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
              <p style={{ margin: 0 }}>
                <strong style={{ color: '#f59e0b' }}>Local access required.</strong> This is a white-box attack that
                only works when you control the model weights, gradients, tokenizer, or decoding internals. It cannot be
                run against a black-box target reached only through a hosted API or chat interface.
              </p>
            </div>
          )}

          <div style={{ marginBottom: '1.5rem' }}>
            <h3
              style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: '#8b7cae',
                marginBottom: '0.75rem',
              }}
            >
              Description
            </h3>
            <p style={{ color: '#b6a8d0', lineHeight: 1.6 }}>{node.description}</p>
          </div>

          {node.aliases && node.aliases.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#8b7cae',
                  marginBottom: '0.75rem',
                }}
              >
                Also Known As
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {node.aliases.map((alias, i) => (
                  <span
                    key={i}
                    style={{
                      display: 'inline-block',
                      background: '#150f22',
                      border: '1px solid #3a2e57',
                      borderLeft: '3px solid #06b6d4',
                      borderRadius: 6,
                      padding: '0.4rem 0.7rem',
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '0.8rem',
                      color: '#b6a8d0',
                    }}
                  >
                    {alias}
                  </span>
                ))}
              </div>
            </div>
          )}

          {node.ideas && node.ideas.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <button
                onClick={() => setShowIdeas(!showIdeas)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#8b7cae',
                  marginBottom: '0.75rem',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                General Ideas ({node.ideas.length}){showIdeas ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {showIdeas && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {node.ideas.map((idea, i) => (
                    <div
                      key={i}
                      style={{
                        background: '#150f22',
                        borderLeft: '3px solid #06b6d4',
                        paddingLeft: '1rem',
                        padding: '0.75rem 1rem 0.75rem calc(1rem + 3px)',
                        fontSize: '0.875rem',
                        color: '#b6a8d0',
                        lineHeight: 1.5,
                      }}
                    >
                      {idea}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {node.examples && node.examples.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <button
                onClick={() => setShowExamples(!showExamples)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#8b7cae',
                  marginBottom: '0.75rem',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                Example Prompts ({node.examples.length})
                {showExamples ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {showExamples && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {node.examples.map((ex, i) => (
                    <div
                      key={i}
                      style={{
                        background: '#16102a',
                        border: '1px solid #2e2247',
                        borderRadius: 6,
                        padding: '0.75rem 1rem',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '0.875rem',
                        color: '#b6a8d0',
                        lineHeight: 1.5,
                        wordBreak: 'break-word',
                      }}
                    >
                      {ex}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ paddingTop: '1rem', borderTop: '1px solid #2e2247' }}>
            <a
              href="https://github.com/Arcanum-Sec/arc_pi_taxonomy"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontSize: '0.875rem',
                color: '#06b6d4',
                textDecoration: 'none',
              }}
            >
              <ExternalLink size={14} /> View on GitHub
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
