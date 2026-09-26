export enum FeatureFlag {
  AI_CATEGORIZATION = 'ai.categorization',
  AI_SENTIMENT = 'ai.sentiment',
  AI_URGENCY = 'ai.urgency',
  AI_RESPONSE_SUGGESTION = 'ai.response_suggestion',
  AI_SUMMARY = 'ai.summary',
  AI_RISK_SCORE = 'ai.risk_score',
  /** Lets AI results escalate tickets without a human. Off unless a tenant enables it. */
  AI_AUTO_ESCALATION = 'ai.auto_escalation',
  ADVANCED_SEARCH = 'search.advanced',
  DASHBOARD_PROJECTIONS = 'dashboard.projections',
  OUTBOX_PROCESSING = 'infrastructure.outbox_processing',
}
