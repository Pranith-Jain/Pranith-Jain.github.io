import { useState } from 'react';
import { motion } from 'framer-motion';
import { stats } from '../../data/content';

const CYBERSECURITY_IMAGE_URL =
  'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=900';

export function About() {
  const [imageError, setImageError] = useState(false);

  return (
    <section id="about" className="mt-32 scroll-mt-24">
      <div className="grid items-center gap-16 lg:grid-cols-2">
        {/* Left Content */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400">
            About Me
          </div>
          <h2 className="text-4xl font-extrabold tracking-tight sm:text-5xl text-slate-900 dark:text-white leading-tight">
            From Investigation to Automation
          </h2>
          <div className="mt-8 space-y-6 text-lg text-slate-700 dark:text-slate-300 leading-relaxed">
            <p>
              My approach starts with the alert. I&apos;ve investigated{' '}
              <span className="font-bold text-slate-900 dark:text-white">
                250+ phishing, BEC, and malware incidents
              </span>
              —from suspicious email headers to payload analysis. Each investigation taught me how attackers think, what
              patterns they follow, and where defenses fail.
            </p>
            <p>
              That hands-on experience shaped how I build automation. Using{' '}
              <span className="text-brand-700 dark:text-brand-400 font-semibold">n8n playbooks and MCP frameworks</span>
              , I reduced response times from 4 hours to under 75 minutes. I map threats to MITRE ATT&CK, correlate IoCs
              across campaigns, and continuously tune detection to minimize false positives.
            </p>
            <p>
              Currently expanding into{' '}
              <span className="text-brand-700 dark:text-brand-400 font-semibold">
                AI security and NHI (Non-Human Identity) governance
              </span>
              , applying the same investigation-first mindset to emerging attack vectors. My work bridges technical
              controls with business-critical trust signals across 150+ global brands.
            </p>
            <p>
              I am currently seeking new security challenges where I can leverage my expertise in email defense,
              automation, and threat intelligence to protect and scale security operations in enterprise environments.
            </p>
          </div>

          {/* Stats Grid */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-6"
          >
            {stats.map((stat) => (
              <div key={stat.label} className="glass rounded-2xl p-4 text-center">
                <div className="text-3xl font-black text-brand-600 dark:text-brand-400">{stat.value}</div>
                <div className="text-xs font-bold uppercase tracking-wider text-slate-600 mt-1">{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </motion.div>

        {/* Right Content - Image */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="relative"
        >
          <div className="glass relative z-10 overflow-hidden rounded-[3rem] p-2 shadow-2xl">
            {!imageError ? (
              <img
                src={CYBERSECURITY_IMAGE_URL}
                alt="Pranith Jain — security analyst portfolio"
                loading="lazy"
                decoding="async"
                onError={() => setImageError(true)}
                className="rounded-[2.5rem] grayscale hover:grayscale-0 hover:scale-[1.02] transition-all duration-700 w-full"
              />
            ) : (
              <div className="rounded-[2.5rem] w-full aspect-video bg-gradient-to-br from-brand-500/20 to-slate-800/20 flex items-center justify-center">
                <div className="text-center p-8">
                  <div className="text-4xl mb-2">🛡️</div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Cybersecurity Visualization</p>
                </div>
              </div>
            )}
          </div>
          <div className="absolute -right-8 -top-8 -z-10 h-64 w-64 rounded-full bg-brand-500/10 blur-3xl"></div>
          <div className="absolute -bottom-8 -left-8 -z-10 h-40 w-40 rounded-full bg-emerald-500/10 blur-2xl"></div>
        </motion.div>
      </div>
    </section>
  );
}
