import { synonymMap } from './synonyms';

/**
 * Parses Spin-Tax format: {word1|word2|word3}
 */
export function applySpinTax(text: string): string {
  return text.replace(/\{([^{}]+)\}/g, (_, match) => {
    const parts = match.split('|');
    if (parts.length === 1) return `{${match}}`;
    return parts[Math.floor(Math.random() * parts.length)];
  });
}

/**
 * Adds invisible unicode variation selectors randomly to make each message unique at byte level
 */
function addInvisibleVariation(text: string): string {
  const invisibles = ['\u200B', '\u200C', '\u200D', '\uFEFF']
  const words = text.split(' ')
  return words.map((word, i) => {
    // Randomly insert invisible char after some words
    if (i > 0 && Math.random() < 0.2) {
      return invisibles[Math.floor(Math.random() * invisibles.length)] + word
    }
    return word
  }).join(' ')
}

/**
 * Randomly varies punctuation and spacing slightly
 */
function varyPunctuation(text: string): string {
  return text
    .replace(/\.\.\./g, () => Math.random() > 0.5 ? '…' : '...')
    .replace(/!/g, () => Math.random() > 0.7 ? '!!' : '!')
    .replace(/,\s/g, () => Math.random() > 0.5 ? ', ' : ',  ')
}

/**
 * Replaces random words with synonyms and adds subtle variations
 */
export function twistMessage(text: string, frequency: number = 0.3): string {
  const parts = text.split(/(\{.*?\})/g);

  const twistedParts = parts.map(part => {
    if (part.startsWith('{') && part.endsWith('}')) return part;

    return part.split(/\b/).map(word => {
      const lowerWord = word.toLowerCase();
      if (synonymMap[lowerWord] && Math.random() < frequency) {
        const options = synonymMap[lowerWord];
        const replacement = options[Math.floor(Math.random() * options.length)];
        if (word[0] === word[0].toUpperCase()) {
          return replacement.charAt(0).toUpperCase() + replacement.slice(1);
        }
        return replacement;
      }
      return word;
    }).join('');
  });

  let result = applySpinTax(twistedParts.join(''))
  result = varyPunctuation(result)
  result = addInvisibleVariation(result)
  return result
}
