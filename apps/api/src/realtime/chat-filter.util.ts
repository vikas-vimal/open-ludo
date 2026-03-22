const PROFANE_WORDS = ['damn', 'hell', 'shit', 'fuck', 'bitch', 'asshole', 'bastard'];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const profanityPattern = new RegExp(`\\b(${PROFANE_WORDS.map(escapeRegex).join('|')})\\b`, 'gi');

export function sanitizeChatMessage(input: string): string {
  return input.replace(profanityPattern, (match) => '*'.repeat(match.length));
}
