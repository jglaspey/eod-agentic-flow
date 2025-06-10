# 🏠 Supplement Creation AI Agent

An intelligent system that analyzes roofing estimates and inspection reports to automatically generate supplement recommendations using AI agents.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm/yarn
- Supabase account
- OpenAI API key
- Anthropic API key (optional)
- Mistral API key (optional, for enhanced OCR)

### 1. Clone and Install
```bash
git clone <your-repo>
cd supplement-creation
npm install
```

### 2. Environment Setup
Create `.env.local`:
```bash
# Database
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# AI APIs
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
MISTRAL_API_KEY=your_mistral_key  # For enhanced OCR processing

# App
NEXTAUTH_SECRET=your_nextauth_secret
NEXTAUTH_URL=http://localhost:3000
```

### 3. Database Setup
Run the SQL from `setup-database.sql` in your Supabase SQL editor to create:
- `jobs` table for job tracking
- `job_data` table for extracted data storage
- `ai_config` table for AI prompt configurations

### 4. Run Development Server
```bash
npm run dev
```
Visit `http://localhost:3000`

## 📋 How It Works

### Agent Workflow
1. **File Upload**: User uploads estimate PDF and roof report PDF
2. **OrchestrationAgent**: Coordinates the entire process
3. **EstimateExtractorAgent**: Extracts line items, totals, and metadata from estimates
   - Text extraction for standard PDFs
   - Mistral OCR for image-based PDFs with dynamic confidence scoring
   - Fallback mechanisms for challenging documents
4. **RoofReportExtractorAgent**: Extracts roof measurements and damage details
5. **SupplementGeneratorAgent**: Analyzes discrepancies and suggests supplements using Xactimate codes

### Key Features
- **Real-time Logging**: Live job progress via Server-Sent Events
- **Mistral OCR Integration**: Advanced OCR with line item extraction and quality indicators
- **Dynamic Confidence Scoring**: Field-level validation and quality assessment
- **Xactimate Code Integration**: Uses standardized roofing codes from `codes.md`
- **Discrepancy Analysis**: Compares estimate vs. inspection data
- **Structured Output**: Generates actionable supplement recommendations

## 🚀 Deployment

### Vercel Deployment
1. **Connect Repository**:
   ```bash
   vercel --prod
   ```

2. **Environment Variables**:
   Add all `.env.local` variables in Vercel dashboard

3. **Build Settings**:
   - Framework: Next.js
   - Build Command: `npm run build`
   - Output Directory: `.next`

### Supabase Configuration
- Ensure RLS policies are configured for production
- Update CORS settings for your Vercel domain
- Verify service role key permissions

### Post-Deployment Checklist
- [ ] Test file upload functionality
- [ ] Verify AI API connections
- [ ] Check database connectivity
- [ ] Test real-time logging
- [ ] Validate supplement generation

## 🔧 Development

### Project Structure
```
src/
├── app/                 # Next.js app router
│   ├── api/            # API routes
│   └── (dashboard)/    # Dashboard pages
├── agents/             # AI agent implementations
├── components/         # React components
├── lib/               # Utilities and services
└── types/             # TypeScript definitions
```

### Key Files
- `src/agents/OrchestrationAgent.ts` - Main workflow coordinator
- `src/lib/ai-orchestrator.ts` - AI interaction layer
- `src/lib/log-streamer.ts` - Real-time logging system
- `codes.md` - Xactimate code reference

### Adding New Agents
1. Extend the `Agent` base class
2. Implement required `act()` method
3. Add to `OrchestrationAgent` workflow
4. Update type definitions in `src/agents/types.ts`

## 🐛 Troubleshooting

### Common Issues

**Build Failures**:
- Check TypeScript errors: `npm run type-check`
- Verify all environment variables are set
- Ensure Supabase connection is working

**AI API Errors**:
- Verify API keys are correct and have sufficient credits
- Check rate limits and quotas
- Review AI config table in Supabase

**File Upload Issues**:
- Confirm file size limits (default 10MB)
- Check PDF processing dependencies
- Verify Supabase storage bucket permissions

**Real-time Logging Not Working**:
- Ensure SSE endpoint is accessible
- Check browser network tab for connection issues
- Verify job ID is being passed correctly

### Performance Optimization
- Monitor AI API usage and costs
- Implement caching for repeated extractions
- Consider batch processing for multiple files
- Use Vercel Edge Functions for faster response times

## 📊 Monitoring

### Logging Levels
- `info`: General process steps
- `success`: Successful completions
- `error`: Failures and exceptions
- `debug`: Detailed debugging info
- `ai-prompt`: AI prompts sent
- `ai-response`: AI responses received

### Key Metrics to Track
- Job completion rates
- AI API response times
- Extraction accuracy
- User satisfaction with supplements

## 🔐 Security

- All file uploads are processed server-side
- AI API keys are stored securely in environment variables
- Database access uses Row Level Security (RLS)
- No sensitive data is logged or cached client-side

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

[Your License Here]