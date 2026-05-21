# 도메인: AI 모델 라우팅 & AIService

Clauday는 기능별로 적절한 Claude 모델을 선택하는 "라우팅" 시스템을 사용합니다.

## 라우팅 규칙

| 기능 | 용도 | 모델 | 이유 |
|-----|------|------|------|
| 메신저 요약 | 긴 채팅 → 한 문장 | Haiku | 비용 절감, 간단한 작업 |
| 빠른 태스크 생성 | 자유 입력 → 제목/본문 | Haiku | 빠름, 반복성 낮음 |
| 세션 요약 | Claude 세션 → 3~5줄 | Haiku | 간단한 정보 압축 |
| AI 브리핑 | 여러 소스 → 구조화 | Sonnet | 복잡한 분석, 중간 속도 |
| 위키 작성 | 지시 → 마크다운 | Sonnet | 품질 + 비용 균형 |
| 메시지 작성 | 채팅 어시스트 | Sonnet | 자연스러운 문체 |
| 코드리뷰 | diff → 분석 | Sonnet | 기술 분석, 상세함 |
| 설계/리팩터링 | 아키텍처 제안 | Opus | 복잡한 추론 필수 |
| 추천 분석 | 사용 패턴 분석 | Opus | 깊은 이해 필요 |

## 진입점

**파일**: `src/main/ai/AIService.ts` (~400줄)

```typescript
export class AIService {
  async ask(params: {
    prompt: string
    systemPrompt?: string
    model?: AIModelName  // 'haiku' | 'sonnet' | 'opus'
    feature?: keyof AIModelConfig  // 기능별 라우팅
  }): Promise<string> {
    // 1) 모델 결정
    let model = params.model
    if (!model && params.feature) {
      model = this.selectModelForFeature(params.feature)
    }
    model = model || 'sonnet'  // 기본값
    
    // 2) Claude API 호출
    const response = await this.callClaudeAPI({
      ...params,
      model
    })
    
    return response.content[0].text
  }

  private selectModelForFeature(feature: string): AIModelName {
    const config = this.getModelConfig()
    return config[feature] || 'sonnet'
  }
}
```

## AIModelConfig 타입

```typescript
// shared/types/ai.ts
export interface AIModelConfig {
  summarizeMessenger: AIModelName
  summarizeSession: AIModelName
  generateTask: AIModelName
  generateBriefing: AIModelName
  generateReport: AIModelName
  generateWiki: AIModelName
  composeMessage: AIModelName
  codeReview: AIModelName
  generateSkill: AIModelName
  recommendAnalyze: AIModelName
  [key: string]: AIModelName
}

export const DEFAULT_MODEL_CONFIG: AIModelConfig = {
  summarizeMessenger: 'haiku',
  summarizeSession: 'haiku',
  generateTask: 'haiku',
  generateBriefing: 'sonnet',
  generateReport: 'sonnet',
  generateWiki: 'sonnet',
  composeMessage: 'sonnet',
  codeReview: 'sonnet',
  generateSkill: 'sonnet',
  recommendAnalyze: 'opus'
}
```

## 비용 최적화 전략

### 1. Haiku 우선 (간단한 작업)

```typescript
// 메신저 요약 (한 문장)
async summarizeMessage(text: string): Promise<string> {
  return this.ask({
    prompt: `다음 메시지를 한 문장으로 요약:\n${text}`,
    feature: 'summarizeMessenger'  // → Haiku
  })
}
```

### 2. Sonnet 중간 (일반적 작업)

```typescript
// AI 브리핑 (구조화된 JSON)
async generateBriefing(tasks: DoorayTask[]): Promise<AIBriefing> {
  return this.ask({
    prompt: `...(상세 지시)...`,
    feature: 'generateBriefing'  // → Sonnet
  })
}
```

### 3. Opus 최소 사용 (복잡한 추론)

```typescript
// 추천 분석 (사용 패턴 분석)
async analyzeRecommendations(usage: UsageData): Promise<string> {
  return this.ask({
    prompt: `...(복잡한 분석)...`,
    feature: 'recommendAnalyze'  // → Opus
  })
}
```

## Claude API 호출 구현

```typescript
private async callClaudeAPI(params: {
  prompt: string
  systemPrompt?: string
  model: AIModelName
}): Promise<ContentBlock[]> {
  const client = new Anthropic({
    apiKey: await this.getApiKey()
  })

  const response = await client.messages.create({
    model: this.getClaudeModel(params.model),
    max_tokens: 2048,
    system: params.systemPrompt || '당신은 유능한 업무 어시스턴트입니다.',
    messages: [
      {
        role: 'user',
        content: params.prompt
      }
    ]
  })

  return response.content
}

private getClaudeModel(name: AIModelName): string {
  const mapping = {
    haiku: 'claude-3-5-haiku-20241022',
    sonnet: 'claude-3-5-sonnet-20241022',
    opus: 'claude-3-opus-20250219'
  }
  return mapping[name]
}
```

## 사용량 추적

```typescript
interface UsageRecord {
  feature: string
  model: AIModelName
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheCreationTokens?: number
  costUSD: number
  timestamp: number
}

// API 응답에서 추출
private recordUsage(
  feature: string,
  model: AIModelName,
  response: Message
): void {
  const { usage } = response
  const record: UsageRecord = {
    feature,
    model,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens,
    cacheCreationTokens: usage.cache_creation_input_tokens,
    costUSD: this.calculateCost(model, usage),
    timestamp: Date.now()
  }
  
  analyticsService.track('ai_call', record)
}

private calculateCost(model: AIModelName, usage: Usage): number {
  // 모델별 가격 (달러/토큰)
  const prices = {
    haiku: { input: 0.80 / 1_000_000, output: 4 / 1_000_000 },
    sonnet: { input: 3 / 1_000_000, output: 15 / 1_000_000 },
    opus: { input: 15 / 1_000_000, output: 75 / 1_000_000 }
  }
  
  const price = prices[model]
  const baseCost = 
    (usage.input_tokens - (usage.cache_read_input_tokens ?? 0)) * price.input +
    usage.output_tokens * price.output
  
  // 캐시 읽기는 10% 비용
  const cacheCost = (usage.cache_read_input_tokens ?? 0) * price.input * 0.1
  
  return baseCost + cacheCost
}
```

## 모델 설정 UI (Renderer)

```typescript
// SettingsPanel.tsx
export function AISettings() {
  const [config, setConfig] = useState<AIModelConfig>(DEFAULT_MODEL_CONFIG)

  useEffect(() => {
    window.api.ai.getModelConfig().then(setConfig)
  }, [])

  const handleModelChange = (feature: string, model: AIModelName) => {
    const updated = { ...config, [feature]: model }
    setConfig(updated)
    window.api.ai.setModelConfig(updated)
  }

  return (
    <div>
      <h3>AI 모델 설정</h3>
      
      <table>
        <thead>
          <tr>
            <th>기능</th>
            <th>모델</th>
            <th>설명</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(config).map(([feature, model]) => (
            <tr key={feature}>
              <td>{feature}</td>
              <td>
                <select
                  value={model}
                  onChange={e =>
                    handleModelChange(feature, e.target.value as AIModelName)
                  }
                >
                  <option value="haiku">Haiku (가장 빠름, 저비용)</option>
                  <option value="sonnet">Sonnet (균형)</option>
                  <option value="opus">Opus (가장 강력함)</option>
                </select>
              </td>
              <td>{getFeatureDescription(feature)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

## 에러 처리 & Fallback

```typescript
async ask(params: { prompt: string; model?: AIModelName }): Promise<string> {
  try {
    return await this.callClaudeAPI(params)
  } catch (err) {
    if ((err as any).status === 401) {
      // 인증 실패
      throw new Error('Claude 인증 오류. Settings에서 토큰을 확인하세요.')
    }
    
    if ((err as any).status === 429) {
      // Rate limit
      throw new Error('요청이 너무 많습니다. 조금 후 시도하세요.')
    }
    
    if ((err as any).status === 500) {
      // Server error
      throw new Error('Claude API 서버 오류. 잠시 후 다시 시도하세요.')
    }
    
    throw err
  }
}
```

## 프롬프트 작성 팁

### Haiku용 (간단, 명확)

```typescript
const prompt = `다음 텍스트를 한 문장으로 요약하세요:

"${text}"`
```

### Sonnet용 (구조화된 결과)

```typescript
const prompt = `다음 정보를 JSON으로 구조화하세요:
{
  "urgent": [...],
  "focus": [...],
  "recommendations": [...]
}

정보:
${JSON.stringify(data)}`
```

### Opus용 (복잡한 분석)

```typescript
const prompt = `사용자의 작업 패턴을 분석하세요:
1. 사용량 통계: ${JSON.stringify(stats)}
2. 최근 활동: ${JSON.stringify(activities)}
3. 도구 선호도: ${JSON.stringify(tools)}

분석:
- 주요 사용 시간대
- 효율성 개선 제안
- 도구별 최적 활용법`
```

## 캐시 활용 (비용 절감)

Prompt caching을 사용하면 같은 프롬프트를 반복할 때 비용을 90% 절감합니다.

```typescript
// 시스템 프롬프트를 캐시
const response = await client.messages.create({
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 1024,
  system: [
    {
      type: 'text',
      text: '당신은 업무 어시스턴트입니다...'
    },
    {
      type: 'text',
      text: '(사용자 지시 — 길고 반복되는 내용)',
      cache_control: { type: 'ephemeral' }
    }
  ],
  messages: [
    {
      role: 'user',
      content: '(실제 질문)'
    }
  ]
})
```

## 새로운 AI 기능 추가

1. **기능명 정의** (예: `analyzeProjectHealth`)
2. **AIModelConfig에 추가**
   ```typescript
   export interface AIModelConfig {
     analyzeProjectHealth: AIModelName  // 기본값 'sonnet'
   }
   ```
3. **AIService에 메서드 추가**
   ```typescript
   async analyzeProjectHealth(project: Project): Promise<string> {
     return this.ask({
       prompt: '...',
       feature: 'analyzeProjectHealth'
     })
   }
   ```
4. **IPC 핸들러 등록** (Renderer에 노출)
5. **Renderer에서 호출**
   ```typescript
   const analysis = await window.api.ai.ask({
     prompt: '...',
     feature: 'analyzeProjectHealth'
   })
   ```

## 모니터링 & 대시보드

Settings → 사용량 탭에서:
- 일별 비용
- 모델별 사용량
- 기능별 호출 횟수
- 캐시 히트율

## 참고

- [Claude API 가격](https://www.anthropic.com/pricing/claude)
- [Prompt caching 가이드](https://docs.anthropic.com/claude/reference/prompt-caching)
- [Claude 모델 지원](https://docs.anthropic.com/claude/reference/models-overview)
