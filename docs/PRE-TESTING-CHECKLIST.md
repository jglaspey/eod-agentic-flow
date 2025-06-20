# Pre-Testing Checklist for Multi-Pass Supplement Generation

## ✅ Branch and Code Ready
- [x] Feature branch created: `feature/multi-pass-supplement-generation`
- [x] All changes committed with proper commit messages
- [x] Build passes successfully (`npm run build` ✓)
- [x] All tests passing (42/42 tests ✓)

## 📋 Next Steps Before Testing Real PDFs

### 1. Update Supabase Database
**IMPORTANT: Run this SQL in your Supabase SQL Editor:**

```bash
# File to run: supabase-multi-pass-update.sql
```

This update includes:
- Enhanced AI prompts for multi-item JSON output
- New logging table `job_logs` for better debugging
- Supplement items table enhancements
- Performance optimizations

### 2. Environment Variables Check
Ensure you have these in your `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL` ✓
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` ✓
- `SUPABASE_SERVICE_ROLE_KEY` ✓
- `ANTHROPIC_API_KEY` ✓
- `OPENAI_API_KEY` (optional) ✓

### 3. Deploy to Development/Staging
- Deploy this branch to your development environment
- Verify the API endpoints are working
- Check that all new dependencies are installed

## 🧪 Testing Strategy

### Phase 1: Basic Functionality Test
1. Upload a simple estimate + roof report PDF pair
2. Monitor the logs in Supabase `job_logs` table
3. Verify multi-pass workflow execution:
   - Pass 1: AI suggestions
   - Pass 2: Business rules
   - Pass 3: Validation
   - Pass 4: Follow-up logic
   - Pass 5: Confidence scoring

### Phase 2: Multi-Item Output Verification
Test with PDFs that should generate multiple supplements:
- Missing drip edge + ice & water barrier
- Ridge cap quality issues + starter row problems
- Multiple missing components

### Phase 3: Edge Cases
- PDFs with poor OCR quality
- Estimates that are already complete
- Malformed PDF files

## 🔍 Debugging Tools Available

### 1. Enhanced Logging
- Check `/api/debug/logs/[jobId]` for detailed logs
- Each pass logs its progress and results
- Failed validations are logged with reasons

### 2. Database Tables to Monitor
- `supplement_items` - Final output
- `job_logs` - Detailed execution logs
- `ai_config` - Verify prompt updates

### 3. Test Endpoints
- `/api/process` - Main processing endpoint
- `/api/jobs/[id]/status` - Job status checking
- `/api/jobs/[id]/logs` - Job-specific logs

## 🚨 Known Limitations in V1

1. **Follow-up AI calls** (Pass 4) are placeholder - not implemented yet
2. **Xactimate code validation** relies on hardcoded list - will need expansion
3. **Business rules** are specific to provided mermaid charts - may need customization

## 🎯 Success Criteria for Testing

### Must Have:
- [ ] Generate 2+ supplement items when appropriate (not just 1)
- [ ] No duplicate suggestions for existing estimate items
- [ ] Reasonable quantities based on roof measurements
- [ ] Valid Xactimate codes from reference list

### Nice to Have:
- [ ] Business rules catch items AI missed
- [ ] Validation prevents obvious errors
- [ ] Confidence scores are meaningful
- [ ] Processing completes in <30 seconds

## 📞 If Issues Arise

1. **Check logs first**: Use the debug endpoints
2. **Database issues**: Verify SQL update ran correctly
3. **AI response issues**: Check `ai_config` table prompts
4. **Build/deploy issues**: Verify all dependencies installed

## Ready to Test? 🚀

Once you've:
1. Run the `supabase-multi-pass-update.sql` file
2. Deployed the branch to your environment
3. Verified environment variables are set

You should be ready to test with real PDFs!

---

**Current Status**: Code ready, waiting for database update and deployment before PDF testing.