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
