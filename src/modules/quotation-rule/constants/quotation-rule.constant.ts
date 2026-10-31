export const QUOTATION_RULE = {
  VRF_HEADERS: 'vrf_headers',
  VRF_CONTROLS: 'vrf_controls',
  PIPING: 'piping',
  ZERO_PRICE: 'zero_price',
  DO_NOT_SELL: 'do_not_sell',
  CAPACITY_DISTANCE: 'capacity_distance',
  LESS_USEFUL: 'less_useful',
  VRF_RATIO: 'vrf_ratio',
  MISSING_OUTDOOR: 'missing_outdoor',
  MISSING_INDOOR: 'missing_indoor',
  PAYMENT_TERMS: 'payment_terms',
  PAYMENT_SCHEDULE: 'payment_schedule',
} as const;
export const RULE_PARAMETER = {
  MAXIMUM_DEVIATION: 'maximumDeviation',
  MINIMUM_RATIO: 'minimumRatio',
  MAXIMUM_RATIO: 'maximumRatio',
} as const;
export const QUOTATION_RULE_KEYS = Object.values(QUOTATION_RULE).toSorted();
export type TQuotationRuleKey =
  (typeof QUOTATION_RULE)[keyof typeof QUOTATION_RULE];
export const RULE_PARAMETER_KEYS: Partial<Record<TQuotationRuleKey, string[]>> =
  {
    [QUOTATION_RULE.CAPACITY_DISTANCE]: [RULE_PARAMETER.MAXIMUM_DEVIATION],
    [QUOTATION_RULE.VRF_RATIO]: [
      RULE_PARAMETER.MINIMUM_RATIO,
      RULE_PARAMETER.MAXIMUM_RATIO,
    ],
  };
