export type CliProvider = 'claude';

const CLAUDE_MODELS: Record<string, string> = {
  'opus':      'claude-opus-4-6',
  'opus4':     'claude-opus-4-6',
  'opus4.5':   'claude-opus-4-5',
  'opus4.6':   'claude-opus-4-6',
  'sonnet':    'claude-sonnet-4-6',
  'sonnet4':   'claude-sonnet-4-6',
  'sonnet4.6': 'claude-sonnet-4-6',
  'haiku':     'claude-haiku-4-5-20251001',
  'haiku4':    'claude-haiku-4-5-20251001',
  'haiku4.5':  'claude-haiku-4-5-20251001',
};

export const MODEL_MAPS: Record<CliProvider, Record<string, string>> = {
  claude: CLAUDE_MODELS,
};

export const DISPLAY_NAMES: Record<string, string> = {
  'claude-opus-4-5':           'Opus 4.5',
  'claude-opus-4-6':           'Opus 4.6',
  'claude-sonnet-4-6':         'Sonnet 4.6',
  'claude-haiku-4-5-20251001': 'Haiku 4.5',
};

export const MAX_CONTEXT: Record<string, number> = {
  'claude-opus-4-5':           1_000_000,
  'claude-opus-4-6':           1_000_000,
  'claude-sonnet-4-6':         1_000_000,
  'claude-haiku-4-5-20251001': 200_000,
};

const MODEL_RANK: Record<string, number> = {
  'claude-haiku-4-5-20251001': 1,
  'claude-sonnet-4-6':         2,
  'claude-opus-4-5':           3,
  'claude-opus-4-6':           4,
};

export const EFFORT_LEVELS: Array<{ label: string; value: string }> = [
  { label: 'Low',    value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High',   value: 'high' },
  { label: 'Max',    value: 'max' },
];

export const EFFORT_EMOJI: Record<string, string> = {
  low: '\uD83D\uDCA4',
  medium: '\u26A1',
  high: '\uD83D\uDD25',
  max: '\uD83D\uDE80',
};

const MAX_EFFORT_MODELS = new Set(['claude-opus-4-5', 'claude-opus-4-6']);
const NO_THINKING_MODELS = new Set(['claude-haiku-4-5-20251001']);

export function getModelDisplayName(modelId: string): string {
  return DISPLAY_NAMES[modelId] || modelId;
}

export function getModelsForPicker(): Array<{ label: string; modelId: string }> {
  const byModel = new Map<string, string[]>();
  for (const [alias, modelId] of Object.entries(CLAUDE_MODELS)) {
    if (!byModel.has(modelId)) byModel.set(modelId, []);
    byModel.get(modelId)!.push(alias);
  }
  return Array.from(byModel.entries())
    .map(([modelId, aliases]) => ({
      label: aliases.sort((a, b) => a.length - b.length)[0],
      modelId,
    }))
    .sort((a, b) => (MODEL_RANK[a.modelId] ?? 99) - (MODEL_RANK[b.modelId] ?? 99));
}

export function resolveModelAlias(input: string): { provider: CliProvider; modelId: string } | null {
  const lower = input.toLowerCase().trim();
  if (lower in CLAUDE_MODELS) return { provider: 'claude', modelId: CLAUDE_MODELS[lower] };
  if (new Set(Object.values(CLAUDE_MODELS)).has(lower)) return { provider: 'claude', modelId: lower };
  return null;
}

export function isValidModel(input: string): boolean {
  const lower = input.toLowerCase().trim();
  if (lower in CLAUDE_MODELS) return true;
  return new Set(Object.values(CLAUDE_MODELS)).has(lower);
}

export function getEffortLevels(modelId?: string): Array<{ label: string; value: string }> {
  if (modelId && NO_THINKING_MODELS.has(modelId)) return [];
  if (!modelId) return EFFORT_LEVELS;
  return EFFORT_LEVELS.filter(l => {
    if (l.value === 'max' && !MAX_EFFORT_MODELS.has(modelId)) return false;
    return true;
  });
}

export function supportsMaxEffort(modelId: string): boolean {
  return MAX_EFFORT_MODELS.has(modelId);
}
