import 'dotenv/config'
import { EstimateExtractorAgent } from './src/agents/EstimateExtractorAgent'
import { PDFToImagesTool } from './src/tools/pdf-to-images'
import { VisionModelProcessor } from './src/tools/vision-models'
import { TaskContext, ExtractionStrategy } from './src/agents/types'
import { readFileSync } from 'fs'

async function testAgentSystem() {
  console.log('🤖 Testing Agentic Workflow System')
  console.log('=====================================')
  
  // Show environment status
  console.log('\n0. Environment Check...')
  console.log(`   SUPABASE_URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ Set' : '❌ Missing'}`)
  console.log(`   OPENAI_API_KEY: ${process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here' ? '✅ Set' : '❌ Missing'}`)
  console.log(`   ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here' ? '✅ Set' : '❌ Missing'}`)
  
  // Test 1: Check if PDF-to-images tool is available
  console.log('\n1. Testing PDF-to-Images Tool...')
  const pdfToolAvailable = await PDFToImagesTool.isAvailable()
  console.log(`   PDF-to-Images Tool: ${pdfToolAvailable ? '✅ Available' : '❌ Not Available'}`)
  
  // Test 2: Check vision models
  console.log('\n2. Testing Vision Models...')
  const visionProcessor = new VisionModelProcessor()
  const openaiAvailable = visionProcessor.isAvailable('openai')
  const anthropicAvailable = visionProcessor.isAvailable('anthropic')
  console.log(`   OpenAI Vision: ${openaiAvailable ? '✅ Available' : '❌ Not Available'}`)
  console.log(`   Anthropic Vision: ${anthropicAvailable ? '✅ Available' : '❌ Not Available'}`)
  
  if (openaiAvailable || anthropicAvailable) {
    const availableModels = visionProcessor.getAvailableModels()
    console.log(`   Available Models: ${availableModels.map(m => `${m.provider}/${m.model}`).join(', ')}`)
  }
  
  // Test 3: Initialize EstimateExtractorAgent
  console.log('\n3. Testing EstimateExtractorAgent...')
  try {
    const agent = new EstimateExtractorAgent()
    console.log(`   Agent Type: ${agent.agentType}`)
    console.log(`   ✅ Agent initialized successfully`)
    
    // Test with a dummy PDF buffer (just for planning)
    const dummyPdfBuffer = Buffer.from('dummy pdf content')
    const context: TaskContext = {
      jobId: 'test-job-123',
      taskId: 'test-task-456',
      priority: 'medium',
      maxRetries: 2,
      retryCount: 0,
      timeoutMs: 30000
    }
    
    console.log('\n4. Testing Agent Planning...')
    const plan = await agent.plan({ 
      pdfBuffer: dummyPdfBuffer, 
      strategy: ExtractionStrategy.HYBRID 
    }, context)
    
    console.log(`   ✅ Plan created with ${plan.tasks.length} tasks`)
    console.log(`   Estimated duration: ${plan.estimatedDuration}ms`)
    console.log(`   Plan confidence: ${plan.confidence}`)
    
    plan.tasks.forEach((task, index) => {
      console.log(`   Task ${index + 1}: ${task.type} (${task.status})`)
    })
    
  } catch (error) {
    console.log(`   ❌ Agent test failed: ${error}`)
  }
  
  console.log('\n🎉 Agent system test completed!')
  console.log('\nNext steps:')
  console.log('- Test with real PDF files')
  console.log('- Implement remaining placeholder methods')
  console.log('- Create RoofReportExtractorAgent')
  console.log('- Build OrchestrationAgent')
}

// Run the test
testAgentSystem().catch(console.error) 