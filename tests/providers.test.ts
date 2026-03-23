import { describe, it, expect } from 'vitest'
import { LLM_PROVIDERS, getProviderById } from '../src/shared/providers'

describe('LLM_PROVIDERS', () => {
  it('should have 5 providers', () => {
    expect(LLM_PROVIDERS).toHaveLength(5)
  })

  it('should include all expected provider IDs', () => {
    const ids = LLM_PROVIDERS.map(p => p.id)
    expect(ids).toContain('minimax')
    expect(ids).toContain('kimi')
    expect(ids).toContain('qwen')
    expect(ids).toContain('openai')
    expect(ids).toContain('custom')
  })

  it('should have valid apiBase URLs for non-custom providers', () => {
    for (const provider of LLM_PROVIDERS) {
      if (provider.id !== 'custom') {
        expect(provider.apiBase).toMatch(/^https:\/\//)
        expect(provider.apiPath).toMatch(/\/v1\//)
      }
    }
  })

  it('should have at least one model for non-custom providers', () => {
    for (const provider of LLM_PROVIDERS) {
      if (provider.id !== 'custom') {
        expect(provider.models.length).toBeGreaterThan(0)
        for (const model of provider.models) {
          expect(model.id).toBeTruthy()
          expect(model.name).toBeTruthy()
        }
      }
    }
  })

  it('custom provider should have empty models and apiBase', () => {
    const custom = LLM_PROVIDERS.find(p => p.id === 'custom')
    expect(custom).toBeDefined()
    expect(custom!.apiBase).toBe('')
    expect(custom!.models).toHaveLength(0)
  })

  it('only minimax should have needsGroupId', () => {
    for (const provider of LLM_PROVIDERS) {
      if (provider.id === 'minimax') {
        expect(provider.needsGroupId).toBe(true)
      } else {
        expect(provider.needsGroupId).toBeFalsy()
      }
    }
  })

  it('qwen should have compatible-mode API path', () => {
    const qwen = LLM_PROVIDERS.find(p => p.id === 'qwen')
    expect(qwen!.apiPath).toContain('/compatible-mode/')
  })
})

describe('getProviderById', () => {
  it('should return provider for valid ID', () => {
    const provider = getProviderById('qwen')
    expect(provider).toBeDefined()
    expect(provider!.name).toBe('通义千问')
  })

  it('should return undefined for invalid ID', () => {
    const provider = getProviderById('nonexistent')
    expect(provider).toBeUndefined()
  })

  it('should return correct provider for each ID', () => {
    for (const p of LLM_PROVIDERS) {
      const found = getProviderById(p.id)
      expect(found).toBe(p)
    }
  })
})
