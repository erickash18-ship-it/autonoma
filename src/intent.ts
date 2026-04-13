export interface DetectedIntent {
  action: string;
  params: Record<string, string>;
  consumedText: boolean;
}

const patterns: Array<{
  regex: RegExp;
  action: string;
  extract?: (match: RegExpMatchArray) => Record<string, string>;
  consume?: boolean;
}> = [
  // Model switching
  { regex: /(?:switch|change|use|set)\s+(?:to\s+)?(?:model\s+)?(?:opus|sonnet|haiku)/i,
    action: 'model', extract: m => {
      const model = m[0].match(/opus|sonnet|haiku/i);
      return { alias: model ? model[0].toLowerCase() : '' };
    }, consume: true },

  // System
  { regex: /(?:system|health|server)\s*(?:status|check|health)/i, action: 'status', consume: true },
  { regex: /(?:how much|check)\s*(?:context|window|tokens)/i, action: 'convolife', consume: false },
  { regex: /^(?:clear|reset)\s*(?:session|chat|context)$/i, action: 'clear', consume: true },

  // Memory
  { regex: /(?:what do you|show)\s*(?:remember|know about me|memories)/i, action: 'memory', consume: true },

  // ---- Add your own intents below ----
  // Example:
  // { regex: /check my todos/i, action: 'todos', consume: true },
];

export function detectIntent(text: string): DetectedIntent | null {
  const trimmed = text.trim();
  if (trimmed.startsWith('/')) return null;
  if (trimmed.length < 4) return null;
  if (trimmed.length > 200) return null;

  for (const p of patterns) {
    const match = trimmed.match(p.regex);
    if (match) {
      return {
        action: p.action,
        params: p.extract ? p.extract(match) : {},
        consumedText: p.consume ?? true,
      };
    }
  }
  return null;
}
