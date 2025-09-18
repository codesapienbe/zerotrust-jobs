// Utility functions for the job advisor app

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

// Company database for categorization
export const COMPANY_DATABASE = {
  // Direct Employers - Tech Companies
  DIRECT_EMPLOYER: [
    'aikido security', 'jetbrains', 'elastic', 'nokia', 'agilent technologies',
    'ing belgium', 'bnp paribas fortis', 'worldline', 'dekimo', 'toqua',
    'fujitsu', 'thales', 'microsoft', 'google', 'apple', 'meta', 'amazon',
    'vind!', 'dalton ai', 'bubblyloo', 'fluves', 'realo', 'langerman diamonds',
    'qaelum', 'somko', 'spott', 'blooloc', 'winamp', 'zencore', 'glowi'
  ],
  
  // IT Consultancies - Safe 3rd Party
  IT_CONSULTANCY: [
    'sopra steria', 'cegeka', 'sii belgium', 'accenture', 'capgemini',
    'deloitte', 'pwc', 'ey', 'kpmg', 'de cronos groep', 'ordina',
    'atos', 'tcs', 'infosys', 'wipro', 'cognizant', 'as one',
    'it labs', 'in4matic', 'nebiru', 'degetel', 'sparklink', 'spilberg',
    'reniver', 'juvo', 'excelerate', 'cipal schaubroeck', 'flowtec group'
  ],
  
  // Recruitment Agencies - Moderate Risk
  RECRUITMENT_AGENCY: [
    'harvey nash', 'talent-it', 'hays', 'randstad', 'adecco', 'manpower',
    'robert half', 'michael page', 'hudson', 'kelly services',
    'kingfisher recruitment', 'akkodis', 'centum recruitment', 'oliver james',
    'response informatics', 'brainwave optigrators', 'optimus search',
    'apollo solutions', 'brayton global', 'indotronix avani', 'consol partners',
    'digisourced', 'nexios it', 'sprint and partners', 'genesis consult'
  ],
  
  // Staffing Agencies - High Risk
  STAFFING_AGENCY: [
    'sparagus', 'nowjobs', 'aurify', 'tempo team', 'synergie',
    'fieldside', 'freelance network'
  ]
}

// Risk assessment based on research data
export const RISK_METRICS = {
  DIRECT_EMPLOYER: { 
    baseRisk: 20, 
    successRate: 70,
    turnoverRate: 12,
    description: 'Direct employers offer the highest success rates and job security'
  },
  IT_CONSULTANCY: { 
    baseRisk: 35, 
    successRate: 60,
    turnoverRate: 18,
    description: 'IT consultancies are the safest 3rd party option with structured career paths'
  }, 
  RECRUITMENT_AGENCY: { 
    baseRisk: 55, 
    successRate: 40,
    turnoverRate: 35,
    description: 'Recruitment agencies provide market access but with moderate risk'
  },
  STAFFING_AGENCY: { 
    baseRisk: 75, 
    successRate: 25,
    turnoverRate: 55,
    description: 'Staffing agencies have highest risk with limited job security'
  },
  UNKNOWN: { 
    baseRisk: 50, 
    successRate: 45,
    turnoverRate: 30,
    description: 'Unknown company type requires additional research'
  }
}

// Red flag patterns based on research
export const RED_FLAG_PATTERNS = [
  'no experience required',
  'make money fast', 
  'work from home easy',
  'immediate start',
  'no qualifications needed',
  'guaranteed income',
  'pyramid',
  'multi-level marketing',
  'mlm',
  'commission only',
  'pay to start',
  'training fee required',
  'investment required',
  'too good to be true',
  'instant approval',
  'no interview process'
]

// Company categorization function
export function categorizeCompany(companyName: string): keyof typeof RISK_METRICS {
  if (!companyName) return 'UNKNOWN'
  
  const name = companyName.toLowerCase().trim()
  
  for (const [category, companies] of Object.entries(COMPANY_DATABASE)) {
    const matchFound = companies.some(company => {
      // Exact match or partial match
      return name.includes(company) || 
             company.includes(name) ||
             name === company
    })
    
    if (matchFound) {
      return category as keyof typeof RISK_METRICS
    }
  }
  
  // Additional heuristics for unknown companies
  const consultancyKeywords = ['consulting', 'consult', 'solutions', 'services', 'group', 'systems']
  const recruitmentKeywords = ['recruitment', 'recruiting', 'talent', 'search', 'headhunt', 'staffing']
  
  if (consultancyKeywords.some(keyword => name.includes(keyword))) {
    return 'IT_CONSULTANCY'
  }
  
  if (recruitmentKeywords.some(keyword => name.includes(keyword))) {
    return 'RECRUITMENT_AGENCY'
  }
  
  return 'UNKNOWN'
}

// Risk score calculation
export function calculateRiskScore(
  companyType: keyof typeof RISK_METRICS,
  factors: {
    hasWebsite: boolean
    jobDescriptionQuality: number
    companyProfileLength: number
    redFlags: string[]
    websiteContent?: string
  }
): number {
  let risk = RISK_METRICS[companyType].baseRisk
  
  // Website presence reduces risk
  if (!factors.hasWebsite) {
    risk += 15
  }
  
  // Website content quality
  if (factors.websiteContent && factors.websiteContent.length > 1000) {
    risk -= 5
  }
  
  // Job description quality
  if (factors.jobDescriptionQuality < 50) {
    risk += 20
  } else if (factors.jobDescriptionQuality > 80) {
    risk -= 10
  }
  
  // Company profile completeness
  if (factors.companyProfileLength < 100) {
    risk += 10
  } else if (factors.companyProfileLength > 500) {
    risk -= 5
  }
  
  // Red flags - major risk increase
  risk += factors.redFlags.length * 15
  
  // Cap the risk between 0 and 100
  return Math.min(Math.max(risk, 0), 100)
}

// Detect red flags in text
export function detectRedFlags(text: string): string[] {
  if (!text) return []
  
  const lowerText = text.toLowerCase()
  return RED_FLAG_PATTERNS.filter(pattern => 
    lowerText.includes(pattern)
  )
}

// Get risk level from score
export function getRiskLevel(score: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (score <= 35) return 'LOW'
  if (score <= 65) return 'MEDIUM'
  return 'HIGH'
}

// Generate recommendations based on analysis
export function generateRecommendations(
  companyType: keyof typeof RISK_METRICS,
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH',
  hasRedFlags: boolean
): string[] {
  const recommendations: string[] = []
  
  // Risk-based recommendations
  switch (riskLevel) {
    case 'LOW':
      recommendations.push('✅ Recommended to apply - low risk profile')
      break
    case 'MEDIUM':
      recommendations.push('⚠️ Proceed with caution - moderate risk detected')
      break
    case 'HIGH':
      recommendations.push('❌ High risk - consider avoiding this opportunity')
      break
  }
  
  // Company type specific advice
  switch (companyType) {
    case 'DIRECT_EMPLOYER':
      recommendations.push('Prioritize this application - direct employers have 2.5x higher success rates')
      break
    case 'IT_CONSULTANCY':
      recommendations.push('Safe 3rd party option - verify project pipeline and employee benefits')
      recommendations.push('Ask about career development and training opportunities')
      break
    case 'RECRUITMENT_AGENCY':
      recommendations.push('Use for market access but maintain realistic expectations')
      recommendations.push('40% chance of communication issues - stay proactive')
      break
    case 'STAFFING_AGENCY':
      recommendations.push('Only consider if you need immediate income')
      recommendations.push('Limited career prospects - treat as temporary solution')
      break
    case 'UNKNOWN':
      recommendations.push('Research company thoroughly before proceeding')
      break
  }
  
  // Red flag warnings
  if (hasRedFlags) {
    recommendations.push('🚨 Multiple red flags detected - exercise extreme caution')
    recommendations.push('Verify all claims independently before proceeding')
  }
  
  // General advice
  recommendations.push('Research company reviews on Glassdoor and LinkedIn')
  recommendations.push('Prepare questions about career development and job security')
  
  if (riskLevel !== 'LOW') {
    recommendations.push('Request detailed contract terms before accepting')
    recommendations.push('Consider this as backup option while pursuing safer opportunities')
  }
  
  return recommendations
}

// Format company type for display
export function formatCompanyType(type: keyof typeof RISK_METRICS): string {
  return type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
} 