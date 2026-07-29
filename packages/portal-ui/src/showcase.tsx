import { useState } from 'react';
import { randomCipher, ScrambleText } from './scramble';

const SHOWCASE_FIELDS = [
  { label: 'name', value: 'Jane Smith, RN' },
  { label: 'email', value: 'jsmith@hospital.org' },
  { label: 'idea title', value: 'Portable ECG triage for post-op rounds' }
];

/** Marketing centerpiece: an interactive seal/unseal demo with sample data. */
export function EncryptionShowcase() {
  const [revealed, setRevealed] = useState(false);
  const [ciphers] = useState(() =>
    SHOWCASE_FIELDS.map(
      (f) =>
        `v2:${randomCipher(8)}:${randomCipher(12)}:${randomCipher(f.value.length + 12)}`
    )
  );

  return (
    <div className="card demo-card">
      <h2>
        Watch the encryption work
        <span className="badge gold">interactive demo</span>
      </h2>
      <p>
        Every name, email, and idea is sealed with AES-256-GCM <em>before</em>{' '}
        it is written to disk. This is what a record actually looks like
        inside our database — open it the way an access key does.
      </p>
      <div className="vault">
        {SHOWCASE_FIELDS.map((f, i) => (
          <div className="vault-row" key={f.label}>
            <span className="vault-label">{f.label}</span>
            <span className={`vault-value${revealed ? ' plain' : ''}`}>
              {revealed ? <ScrambleText text={f.value} /> : ciphers[i]}
            </span>
          </div>
        ))}
        <div className="vault-note">
          postgres · tables: doctor, idea · AES-256-GCM · keys derived per
          tenant (HKDF-SHA256)
        </div>
      </div>
      <button className="primary" onClick={() => setRevealed((r) => !r)}>
        {revealed ? '🔒 Re-seal the record' : '🔑 Decrypt the record'}
      </button>
      <p className="meta" style={{ marginTop: '0.8rem' }}>
        Illustration with sample data. Once you have an access link, the{' '}
        <em>How it works</em> tab shows your actual row in Postgres —
        ciphertext read straight from the database, decrypted live with your
        key.
      </p>
    </div>
  );
}
