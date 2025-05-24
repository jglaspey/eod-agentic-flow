# Deployment Guide

## Prerequisites

Before deploying, ensure you have:

1. **Supabase Project**
   - Create a new project at [supabase.com](https://supabase.com)
   - Note your project URL and anon key

2. **API Keys**
   - OpenAI API key from [platform.openai.com](https://platform.openai.com)
   - Anthropic API key from [console.anthropic.com](https://console.anthropic.com) (optional)

3. **Vercel Account**
   - Sign up at [vercel.com](https://vercel.com)

## Step-by-Step Deployment

### 1. Database Setup

1. **Go to your Supabase project dashboard**
2. **Navigate to SQL Editor**
3. **Run the database schema**:
   - Copy the contents of `src/lib/database-schema.sql`
   - Paste and execute in the SQL Editor
   - Verify all tables are created successfully

### 2. Environment Configuration

1. **Copy environment variables**:
   ```bash
   cp .env.example .env.local
   ```

2. **Fill in your credentials**:
   ```bash
   # Supabase Configuration
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
   
   # AI API Keys
   OPENAI_API_KEY=sk-your_openai_key_here
   ANTHROPIC_API_KEY=sk-ant-your_anthropic_key_here
   ```

### 3. Vercel Deployment

#### Option A: Deploy via Vercel Dashboard

1. **Connect Repository**:
   - Go to [vercel.com/dashboard](https://vercel.com/dashboard)
   - Click "New Project"
   - Import your Git repository

2. **Configure Environment Variables**:
   - In the project settings, add all environment variables from your `.env.local`
   - Make sure to mark sensitive keys as "Sensitive"

3. **Deploy**:
   - Click "Deploy"
   - Vercel will automatically build and deploy your application

#### Option B: Deploy via Vercel CLI

1. **Install Vercel CLI**:
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy**:
   ```bash
   vercel --prod
   ```

4. **Set Environment Variables**:
   ```bash
   vercel env add NEXT_PUBLIC_SUPABASE_URL
   vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
   vercel env add OPENAI_API_KEY
   vercel env add ANTHROPIC_API_KEY
   ```

### 4. Post-Deployment Verification

1. **Test the Upload Interface**:
   - Visit your deployed URL
   - Try uploading sample PDF files
   - Verify the upload interface works

2. **Check Database Connections**:
   - Verify jobs are created in Supabase
   - Check that AI configurations are properly loaded

3. **Monitor Logs**:
   - Use Vercel's function logs to monitor API performance
   - Check Supabase logs for database queries

## Environment Variables Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | Yes |
| `OPENAI_API_KEY` | OpenAI API key for GPT models | Yes |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude models | Optional |

## Performance Optimization

### 1. Vercel Configuration

Add to `vercel.json`:
```json
{
  "functions": {
    "src/app/api/process/route.ts": {
      "maxDuration": 300
    }
  }
}
```

### 2. Supabase Optimization

1. **Enable Connection Pooling**:
   - Go to Project Settings > Database
   - Enable "Use connection pooling"

2. **Add Database Indexes**:
   - The schema already includes optimized indexes
   - Monitor query performance in Supabase dashboard

### 3. AI API Optimization

1. **Configure Rate Limits**:
   - Monitor API usage in OpenAI/Anthropic dashboards
   - Implement retry logic for rate limit errors

2. **Optimize Prompts**:
   - Use the `ai_config` table to A/B test different prompts
   - Adjust temperature and max_tokens for better performance

## Monitoring and Maintenance

### 1. Set Up Alerts

1. **Vercel Alerts**:
   - Monitor function execution times
   - Set up error rate alerts

2. **Supabase Monitoring**:
   - Monitor database performance
   - Set up alerts for connection limits

3. **AI API Monitoring**:
   - Track API usage and costs
   - Monitor response times and error rates

### 2. Regular Maintenance

1. **Database Cleanup**:
   - Implement cleanup jobs for old processing data
   - Archive completed jobs older than 30 days

2. **AI Configuration Updates**:
   - Regularly review and optimize AI prompts
   - Update models as new versions become available

## Troubleshooting

### Common Issues

1. **PDF Processing Fails**:
   - Check file size limits (10MB max)
   - Verify PDF format compatibility
   - Check function timeout settings

2. **Database Connection Errors**:
   - Verify Supabase credentials
   - Check connection pooling settings
   - Monitor concurrent connection limits

3. **AI API Errors**:
   - Verify API keys are correct
   - Check rate limits and quotas
   - Monitor for model availability

### Debug Mode

Enable verbose logging by setting:
```bash
DEBUG=true
```

This will provide detailed logs for troubleshooting issues.

## Scaling Considerations

As usage grows, consider:

1. **Database Scaling**:
   - Upgrade Supabase plan for higher connection limits
   - Implement read replicas for heavy queries

2. **API Rate Limiting**:
   - Implement queue system for high-volume processing
   - Add user-based rate limiting

3. **File Storage**:
   - Move to dedicated file storage (AWS S3, etc.)
   - Implement CDN for faster file access

## Security

1. **API Keys**:
   - Rotate API keys regularly
   - Use different keys for development and production

2. **Database Security**:
   - Regularly review Row Level Security policies
   - Monitor access logs

3. **File Upload Security**:
   - Implement virus scanning for uploaded files
   - Add additional file type validation