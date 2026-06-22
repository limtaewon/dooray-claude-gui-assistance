import { describe, it, expect } from 'vitest'
import {
  wizardNextStep,
  wizardPrevStep,
  STEP_ORDER,
  STEP_LABELS
} from '../import/ImportWizard'
import type { WizardStep } from '../import/ImportWizard'

describe('ImportWizard — 단계 전이 순수 함수', () => {
  it('wizardNextStep: 각 단계에서 다음 단계로', () => {
    expect(wizardNextStep('source')).toBe('scan')
    expect(wizardNextStep('scan')).toBe('normalize')
    expect(wizardNextStep('normalize')).toBe('confirm')
  })

  it('wizardNextStep: 마지막 단계에서는 그대로 유지', () => {
    expect(wizardNextStep('confirm')).toBe('confirm')
  })

  it('wizardPrevStep: 각 단계에서 이전 단계로', () => {
    expect(wizardPrevStep('scan')).toBe('source')
    expect(wizardPrevStep('normalize')).toBe('scan')
    expect(wizardPrevStep('confirm')).toBe('normalize')
  })

  it('wizardPrevStep: 첫 단계에서는 그대로 유지', () => {
    expect(wizardPrevStep('source')).toBe('source')
  })

  it('STEP_ORDER 는 4단계를 순서대로 포함', () => {
    expect(STEP_ORDER).toEqual(['source', 'scan', 'normalize', 'confirm'])
  })

  it('STEP_LABELS 에 모든 단계가 한국어로 정의됨', () => {
    const steps: WizardStep[] = ['source', 'scan', 'normalize', 'confirm']
    for (const step of steps) {
      expect(STEP_LABELS[step]).toBeTruthy()
      // 빈 문자열이 아님
      expect(STEP_LABELS[step].length).toBeGreaterThan(0)
    }
  })

  it('단계 순서는 source → scan → normalize → confirm', () => {
    let step: WizardStep = 'source'
    const visited: WizardStep[] = [step]
    for (let i = 0; i < 3; i++) {
      step = wizardNextStep(step)
      visited.push(step)
    }
    expect(visited).toEqual(['source', 'scan', 'normalize', 'confirm'])
  })

  it('역방향 이동도 올바름', () => {
    let step: WizardStep = 'confirm'
    const visited: WizardStep[] = [step]
    for (let i = 0; i < 3; i++) {
      step = wizardPrevStep(step)
      visited.push(step)
    }
    expect(visited).toEqual(['confirm', 'normalize', 'scan', 'source'])
  })
})
