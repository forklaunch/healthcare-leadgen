import { useEffect, useState } from 'react';

const CIPHER_CHARS =
  'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789+/=';

export function randomCipher(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) {
    s += CIPHER_CHARS[Math.floor(Math.random() * CIPHER_CHARS.length)];
  }
  return s;
}

/** Animates plaintext dissolving left-to-right into ciphertext. */
export function EncryptText({
  text,
  onDone
}: {
  text: string;
  onDone?: () => void;
}) {
  const [display, setDisplay] = useState(text);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const cipher = `v2:${randomCipher(6)}:${randomCipher(Math.max(text.length, 14))}`;
    let frame = 0;
    const total = 22;
    const id = setInterval(() => {
      frame += 1;
      const n = Math.ceil((frame / total) * cipher.length);
      setDisplay(cipher.slice(0, n) + text.slice(Math.min(n, text.length)));
      if (frame >= total) {
        setDisplay(cipher);
        setDone(true);
        clearInterval(id);
        onDone?.();
      }
    }, 60);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return <span className={`vault-value${done ? '' : ' plain'}`}>{display}</span>;
}

/** Animates ciphertext characters resolving left-to-right into plaintext. */
export function ScrambleText({ text }: { text: string }) {
  const [display, setDisplay] = useState(() => randomCipher(text.length));
  useEffect(() => {
    let frame = 0;
    const total = 18;
    const id = setInterval(() => {
      frame += 1;
      const n = Math.ceil((frame / total) * text.length);
      setDisplay(text.slice(0, n) + randomCipher(Math.max(0, text.length - n)));
      if (frame >= total) {
        setDisplay(text);
        clearInterval(id);
      }
    }, 40);
    return () => clearInterval(id);
  }, [text]);
  return <>{display}</>;
}
