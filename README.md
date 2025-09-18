# Job Application Advisor - Next.js WebApp

A comprehensive Next.js web application that provides AI-powered job application risk assessment and advisory reports based on analysis of 178+ real job applications and industry research.

## 🎯 Features

- **Simple Form Interface**: Copy-paste job information without formatting concerns
- **AI-Powered Analysis**: Uses Groq API for fast LLM-based assessment
- **Company Website Scraping**: Firecrawl integration for company research
- **Risk Assessment**: Based on real market research and 3rd party analysis
- **Structured Reports**: Comprehensive advisory reports with actionable recommendations

## 📊 Research Foundation

Built on extensive research including:

- Analysis of 178+ job applications (March-September 2025)
- Industry statistics from 10+ research sources (2024-2025)
- 3rd party intermediary risk assessment
- Direct employer vs intermediary success rate analysis (2.5x difference)

## 🏗️ Tech Stack

- **Frontend**: Next.js 14 with App Router, TypeScript, Tailwind CSS
- **AI Analysis**: Groq SDK (fastest cloud LLM)
- **Web Scraping**: Firecrawl API for company website analysis
- **UI Components**: Lucide React icons, custom Tailwind components
- **Styling**: Tailwind CSS with custom risk-level color schemes

## 📁 Project Structure

```
job-advisor-webapp/
├── app/                          # Next.js App Router
│   ├── api/analyze/route.ts      # AI analysis API endpoint
│   ├── globals.css               # Global styles with Tailwind
│   ├── layout.tsx                # Root layout component
│   └── page.tsx                  # Main application page
├── lib/
│   └── utils.ts                  # Utility functions and constants
├── public/                       # Static assets
├── package.json                  # Dependencies
├── next.config.js               # Next.js configuration
├── tailwind.config.js           # Tailwind CSS config
├── postcss.config.js            # PostCSS config
├── tsconfig.json                # TypeScript config
└── .env.example                 # Environment variables template
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- Groq API key (get from: <https://console.groq.com>)
- Firecrawl API key (get from: <https://firecrawl.dev>)

### Installation

1. **Clone and setup:**

   ```bash
   git clone <repository-url>
   cd job-advisor-webapp
   npm install
   ```

2. **Environment setup:**

   ```bash
   cp .env.example .env.local
   ```

   Add your API keys:

   ```.env
   GROQ_API_KEY=your_groq_api_key_here
   FIRECRAWL_API_KEY=your_firecrawl_api_key_here
   ```

3. **Run development server:**

   ```bash
   npm run dev
   ```

4. **Open application:**
   Navigate to `http://localhost:3000`

## 📋 How It Works

### 1. User Input

- **Company Information**: Name, website, profile/description
- **Job Details**: Title, description
- **Personal Data**: Resume content, additional preferences
- **Flexible Format**: Copy-paste from any source (PDF, LinkedIn, etc.)

### 2. AI Analysis Process

- **Company Categorization**: Direct employer vs 3rd party classification
- **Website Scraping**: Firecrawl extracts company information
- **Risk Assessment**: Calculates risk score based on research data
- **LLM Analysis**: Groq API provides detailed insights
- **Red Flag Detection**: Identifies warning signs automatically

### 3. Advisory Report Generation

- **Risk Level**: Low/Medium/High with color-coded indicators
- **Company Analysis**: Reputation, stability, career prospects
- **Fit Assessment**: Skill match, experience alignment
- **Recommendations**: Apply/avoid with specific reasoning
- **Action Items**: Next steps and due diligence checklist

## 🎨 UI/UX Features

- **Simple Form Design**: Focus on content over formatting
- **Real-time Validation**: Required field highlighting
- **Loading States**: Progress indicators during analysis
- **Risk Color Coding**: Green (low), yellow (medium), red (high)
- **Responsive Design**: Works on desktop and mobile
- **Professional Layout**: Clean, trustworthy appearance

## 🔍 Risk Assessment Logic

### Company Types (Based on Research)

- **Direct Employers** (20% base risk): Highest success rate (70%)
- **IT Consultancies** (35% base risk): Safe 3rd party (60% success)
- **Recruitment Agencies** (55% base risk): Moderate risk (40% success)
- **Staffing Agencies** (75% base risk): Highest risk (25% success)

### Risk Factors

- Website presence and quality
- Job description completeness  
- Red flag patterns (MLM, guaranteed income, etc.)
- Company profile depth
- Market research validation

### Recommendations Engine

- Risk-based advice (apply/avoid)
- Company type specific guidance
- Career development considerations
- Due diligence checklists
- Alternative strategy suggestions

## 🔧 API Endpoints

### POST /api/analyze

Analyzes job application and returns risk assessment.

**Request Body:**

```json
{
  "companyName": "string (required)",
  "jobTitle": "string (required)", 
  "companyWebsite": "string (optional)",
  "companyProfile": "string",
  "jobDescription": "string",
  "resumeContent": "string", 
  "additionalInfo": "string"
}
```

**Response:**

```json
{
  "overallRisk": "LOW|MEDIUM|HIGH",
  "riskScore": "number (0-100)",
  "companyType": "DIRECT_EMPLOYER|IT_CONSULTANCY|RECRUITMENT_AGENCY|STAFFING_AGENCY",
  "shouldApply": "boolean",
  "keyFindings": ["string[]"],
  "riskFactors": ["string[]"],
  "recommendations": ["string[]"],
  "companyAnalysis": {
    "reputation": "string",
    "stability": "string", 
    "careerProspects": "string",
    "redFlags": ["string[]"]
  },
  "fitAnalysis": {
    "skillMatch": "number (0-100)",
    "experienceMatch": "number (0-100)",
    "culturefit": "string",
    "salaryExpectation": "string"
  }
}
```

## 📈 Market Research Integration

The application integrates real market research:

- **59.3% of applications go through intermediaries** (based on 178 applications)
- **2.5x higher success rate for direct employers**
- **40-60% annual turnover in staffing agencies**
- **26% positive experience rate with recruitment agencies**
- **65% communication issues with recruitment agencies**

Sources: BambooHR (2025), American Staffing Association (2024), Skima.ai (2025), and others.

## 🛠️ Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server  
- `npm run lint` - Run ESLint

### Key Dependencies

- `next` - React framework
- `groq-sdk` - AI analysis API
- `@mendable/firecrawl-js` - Website scraping
- `lucide-react` - Icon components
- `tailwindcss` - Styling framework

## 🔒 Privacy & Security

- No data persistence - all analysis is session-based
- API keys stored in environment variables
- Rate limiting recommended for production deployment
- HTTPS required for production use

## 🚀 Deployment

### Vercel (Recommended)

1. Connect GitHub repository to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy automatically on push

### Alternative Platforms

- Netlify, Railway, or any Node.js hosting platform
- Ensure environment variables are properly configured
- Set build command: `npm run build`
- Set start command: `npm start`

## 📞 Support

For API keys and setup:

- **Groq API**: <https://console.groq.com>
- **Firecrawl API**: <https://firecrawl.dev>

## 🎯 Use Cases

- **Job Seekers**: Avoid risky applications and focus on high-success opportunities
- **Career Coaches**: Provide data-driven advice to clients  
- **Recruiters**: Understand market positioning and candidate concerns
- **HR Teams**: Benchmark against market standards

Built with research-backed insights to help job seekers make informed decisions! 🚀
