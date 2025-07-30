import 'dotenv/config';
import { getEmbeddingService, EmbeddingServiceFactory } from './src/tools/webScraper/semantic/EmbeddingServiceFactory';
import logger from './utils/logger';

/**
 * Test script to verify LM Studio embedding integration
 */
async function testLMStudioEmbeddings() {
  console.log('🧪 Testing LM Studio Embedding Integration...\n');

  try {
    // Get the embedding service (should auto-select LM Studio if available)
    console.log('📡 Initializing embedding service...');
    const embeddingService = await getEmbeddingService();
    
    console.log(`✅ Active backend: ${embeddingService.getName()}`);
    console.log(`🎯 Priority: ${embeddingService.getPriority()}\n`);

    // Test basic embedding functionality
    console.log('🔬 Testing basic embedding functionality...');
    const testTexts = [
      'Hello world',
      'This is a test sentence for embeddings',
      'Machine learning and artificial intelligence'
    ];

    const embeddingResponse = await embeddingService.embed({
      texts: testTexts,
      requestId: 'test_request'
    });

    console.log(`✅ Generated embeddings for ${embeddingResponse.embeddings.length} texts`);
    console.log(`⏱️  Processing time: ${embeddingResponse.processingTime}ms`);
    console.log(`🖥️  Backend: ${embeddingResponse.backend}`);
    console.log(`📦 Cached: ${embeddingResponse.cached}`);
    
    // Show embedding details
    embeddingResponse.embeddings.forEach((embedding, index) => {
      console.log(`   Text ${index + 1}: "${testTexts[index]}" -> ${embedding.dimension}D vector`);
      console.log(`   First 5 dimensions: [${embedding.vector.slice(0, 5).map(x => x.toFixed(4)).join(', ')}...]`);
    });

    // Test health check
    console.log('\n🏥 Testing health check...');
    const isHealthy = await embeddingService.healthCheck();
    console.log(`✅ Health check: ${isHealthy ? 'PASSED' : 'FAILED'}`);

    // Show backend status
    console.log('\n📊 Backend status:');
    const factory = EmbeddingServiceFactory.getInstance();
    const status = await factory.getBackendStatus();
    
    status.forEach(backend => {
      const statusIcon = backend.isActive ? '🟢' : (backend.healthy ? '🟡' : '🔴');
      console.log(`   ${statusIcon} ${backend.name} (priority: ${backend.priority}) - ${backend.enabled ? 'enabled' : 'disabled'}, ${backend.initialized ? 'initialized' : 'not initialized'}, ${backend.healthy ? 'healthy' : 'unhealthy'}`);
    });

  } catch (error) {
    console.error('❌ Test failed:', error);
    
    // Try to get backend status even on failure
    try {
      console.log('\n📊 Backend status (after failure):');
      const factory = EmbeddingServiceFactory.getInstance();
      const status = await factory.getBackendStatus();
      
      status.forEach(backend => {
        const statusIcon = backend.healthy ? '🟢' : '🔴';
        console.log(`   ${statusIcon} ${backend.name} - ${backend.enabled ? 'enabled' : 'disabled'}, ${backend.initialized ? 'initialized' : 'not initialized'}, ${backend.healthy ? 'healthy' : 'unhealthy'}`);
      });
    } catch (statusError) {
      console.error('❌ Could not get backend status:', statusError);
    }
  }
}

// Test configuration display
function showTestConfiguration() {
  console.log('🔧 Test Configuration:');
  console.log(`   LM_STUDIO_BASE_URL: ${process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234/v1 (default)'}`);
  console.log(`   LM_STUDIO_API_KEY: ${process.env.LM_STUDIO_API_KEY ? '[SET]' : 'lm-studio (default)'}`);
  console.log(`   LM_STUDIO_EMBEDDING_MODEL: ${process.env.LM_STUDIO_EMBEDDING_MODEL || 'nomic-ai/nomic-embed-text-v1.5-GGUF (default)'}`);
  console.log('');
}

// Run the test
async function main() {
  showTestConfiguration();
  await testLMStudioEmbeddings();
}

if (require.main === module) {
  main().catch(console.error);
}

export { testLMStudioEmbeddings };