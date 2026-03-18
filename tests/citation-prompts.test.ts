import { describe, it, expect } from 'vitest'
import { CITATION_PROMPTS, getCitationPrompt } from '../src/shared/citation-prompts'

describe('CITATION_PROMPTS', () => {
  it('should have prompts for all 4 citation standards', () => {
    expect(Object.keys(CITATION_PROMPTS)).toHaveLength(4)
    expect(CITATION_PROMPTS).toHaveProperty('法学引注手册')
    expect(CITATION_PROMPTS).toHaveProperty('GB/T 7714')
    expect(CITATION_PROMPTS).toHaveProperty('APA 7th')
    expect(CITATION_PROMPTS).toHaveProperty('Chicago')
  })

  it('法学引注手册 prompt should contain Chinese citation formats', () => {
    const prompt = CITATION_PROMPTS['法学引注手册']
    expect(prompt).toContain('中文著作')
    expect(prompt).toContain('中文期刊')
    expect(prompt).toContain('外文著作')
    expect(prompt).toContain('法律法规')
    expect(prompt).toContain('司法案例')
  })

  it('GB/T 7714 prompt should contain standard reference types', () => {
    const prompt = CITATION_PROMPTS['GB/T 7714']
    expect(prompt).toContain('[M]')
    expect(prompt).toContain('[J]')
    expect(prompt).toContain('[D]')
    expect(prompt).toContain('[EB/OL]')
  })

  it('APA 7th prompt should mention APA format elements', () => {
    const prompt = CITATION_PROMPTS['APA 7th']
    expect(prompt).toContain('APA 7th')
    expect(prompt).toContain('Book')
    expect(prompt).toContain('Journal')
  })

  it('Chicago prompt should contain note and bibliography formats', () => {
    const prompt = CITATION_PROMPTS['Chicago']
    expect(prompt).toContain('Chicago')
    expect(prompt).toContain('note')
    expect(prompt).toContain('bibliography')
  })
})

describe('getCitationPrompt', () => {
  it('should return prompt for valid group', () => {
    const prompt = getCitationPrompt('法学引注手册')
    expect(prompt).toBeTruthy()
    expect(prompt).toContain('法学引注手册')
  })

  it('should return empty string for null group', () => {
    expect(getCitationPrompt(null)).toBe('')
  })

  it('should return empty string for unknown group', () => {
    expect(getCitationPrompt('Unknown Standard')).toBe('')
  })

  it('should return the full prompt for each standard', () => {
    for (const [group, expectedPrompt] of Object.entries(CITATION_PROMPTS)) {
      expect(getCitationPrompt(group)).toBe(expectedPrompt)
    }
  })
})
