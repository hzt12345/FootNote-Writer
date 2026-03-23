import type { LLMProvider } from './types'

export const LLM_PROVIDERS: LLMProvider[] = [
  {
    id: 'minimax',
    name: '海螺 AI (MiniMax)',
    apiBase: 'https://api.minimaxi.com',
    apiPath: '/v1/chat/completions',
    needsGroupId: true,
    maxTokens: 16384,
    models: [
      { id: 'MiniMax-M2.7', name: 'MiniMax-M2.7 (推荐)' },
      { id: 'MiniMax-M2.7-highspeed', name: 'MiniMax-M2.7-highspeed (快速)' },
      { id: 'MiniMax-M2.5', name: 'MiniMax-M2.5' },
      { id: 'MiniMax-M2.5-highspeed', name: 'MiniMax-M2.5-highspeed' },
    ],
  },
{
    id: 'kimi',
    name: '月之暗面 (Kimi)',
    apiBase: 'https://api.moonshot.cn',
    apiPath: '/v1/chat/completions',
    maxTokens: 4096,
    noTemperature: true,
    models: [
      { id: 'kimi-k2.5', name: 'Kimi K2.5 (推荐)' },
      { id: 'kimi-k2', name: 'Kimi K2' },
      { id: 'kimi-latest', name: 'Kimi Latest' },
      { id: 'moonshot-v1-128k', name: 'Moonshot-v1-128k (旧版)' },
    ],
  },
  {
    id: 'qwen',
    name: '通义千问',
    apiBase: 'https://dashscope.aliyuncs.com',
    apiPath: '/compatible-mode/v1/chat/completions',
    maxTokens: 8192,
    models: [
      { id: 'qwen3-max', name: 'Qwen3-Max (推荐)' },
      { id: 'qwen3.5-plus', name: 'Qwen3.5-Plus' },
      { id: 'qwen3.5-flash', name: 'Qwen3.5-Flash (经济)' },
      { id: 'qwen-plus', name: 'Qwen-Plus (旧版)' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    apiBase: 'https://api.openai.com',
    apiPath: '/v1/chat/completions',
    maxTokens: 16384,
    models: [
      { id: 'gpt-5.4', name: 'GPT-5.4 (推荐)' },
      { id: 'gpt-5.4-mini', name: 'GPT-5.4-mini' },
      { id: 'gpt-5.4-nano', name: 'GPT-5.4-nano (经济)' },
    ],
  },
  {
    id: 'custom',
    name: '自定义',
    apiBase: '',
    apiPath: '/v1/chat/completions',
    models: [],
  },
]

export function getProviderById(id: string): LLMProvider | undefined {
  return LLM_PROVIDERS.find(p => p.id === id)
}
