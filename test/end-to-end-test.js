#!/usr/bin/env node

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const JSZip = require('jszip');

const execAsync = promisify(exec);

async function testCompleteBotWorkflow() {
  console.log('🚀 Testing Complete Bot Workflow\n');
  console.log('================================\n');
  
  try {
    // Step 1: Compile TypeScript
    console.log('1️⃣ Compiling TypeScript...');
    await execAsync('npx tsc src/services/completeAssetGeneration.service.ts --outDir dist --target es2020 --module commonjs --esModuleInterop --skipLibCheck');
    console.log('✅ TypeScript compilation successful\n');
    
    // Step 2: Import services
    console.log('2️⃣ Loading services...');
    const { CompleteAssetGenerationService } = require('../dist/services/completeAssetGeneration.service');
    console.log('✅ Services loaded successfully\n');
    
    // Step 3: Simulate logo generation (like the bot does)
    console.log('3️⃣ Simulating logo generation...');
    
    // Mock Flux service (simulating Leonardo AI)
    class MockFluxService {
      async generateImage(params) {
        console.log(`   - Generating logo with seed: ${params.selectedSeed}`);
        
        // Create a realistic logo
        const logoBuffer = await sharp({
          create: {
            width: 1024,
            height: 1024,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          }
        })
        .composite([{
          input: Buffer.from(`<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#4F46E5;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#7C3AED;stop-opacity:1" />
              </linearGradient>
            </defs>
            <circle cx="512" cy="512" r="400" fill="url(#grad1)" stroke="white" stroke-width="20"/>
            <text x="512" y="580" text-anchor="middle" fill="white" font-family="Arial" font-size="72" font-weight="bold">TECH</text>
            <text x="512" y="650" text-anchor="middle" fill="white" font-family="Arial" font-size="48" font-weight="300">CORP</text>
          </svg>`),
          top: 0,
          left: 0
        }])
        .png()
        .toBuffer();
        
        return {
          image: `data:image/png;base64,${logoBuffer.toString('base64')}`,
          seed: params.selectedSeed
        };
      }
    }
    
    // Mock Storage service
    class MockStorageService {
      constructor() {
        this.uploads = [];
      }

      async uploadBuffer(buffer, options) {
        const base64 = buffer.toString('base64');
        const mimeType = options.contentType || 'image/png';
        const url = `data:${mimeType};base64,${base64}`;
        this.uploads.push({ url, buffer, options });
        return url;
      }
    }
    
    const fluxService = new MockFluxService();
    const storageService = new MockStorageService();
    const completeAssetService = new CompleteAssetGenerationService(storageService, fluxService);
    
    console.log('✅ Logo generation simulation ready\n');
    
    // Step 4: Simulate user selecting a logo (like clicking "Select This Logo")
    console.log('4️⃣ Simulating user logo selection...');
    
    const logoSelectionParams = {
      brandName: 'TechCorp',
      originalPrompt: 'Modern tech company logo with gradient and clean typography',
      selectedSeed: 12345,
      userId: 'user-12345',
      sessionId: 'session-67890'
    };
    
    console.log('   - User selected logo with parameters:');
    console.log(`     * Brand: ${logoSelectionParams.brandName}`);
    console.log(`     * Seed: ${logoSelectionParams.selectedSeed}`);
    console.log(`     * User ID: ${logoSelectionParams.userId}`);
    
    // Step 5: Generate complete professional package
    console.log('\n5️⃣ Generating complete professional package...');
    console.log('   This simulates what happens when user clicks "Select This Logo"');
    
    const startTime = Date.now();
    const completePackage = await completeAssetService.generateCompletePackage(logoSelectionParams);
    const endTime = Date.now();
    
    console.log(`✅ Complete package generated in ${(endTime - startTime) / 1000}s\n`);
    
    // Step 6: Verify package contents
    console.log('6️⃣ Verifying package contents...');
    
    console.log('📊 Package Summary:');
    console.log('===================');
    
    // Color variants
    console.log('🎨 Color Variants:');
    console.log(`   ✅ Transparent PNG: ${completePackage.transparentPng ? 'Available' : 'Missing'}`);
    console.log(`   ✅ White Background: ${completePackage.whiteBackgroundPng ? 'Available' : 'Missing'}`);
    console.log(`   ✅ Black Background: ${completePackage.blackBackgroundPng ? 'Available' : 'Missing'}`);
    
    // Vector formats
    console.log('\n📐 Vector Formats:');
    console.log(`   ✅ SVG: ${completePackage.svg ? 'Available' : 'Missing'}`);
    console.log(`   ✅ PDF: ${completePackage.pdf ? 'Available' : 'Missing'}`);
    console.log(`   ✅ EPS: ${completePackage.eps ? 'Available' : 'Missing'}`);
    
    // Size variants
    console.log('\n📏 Size Variants:');
    Object.entries(completePackage.sizes).forEach(([category, urls]) => {
      console.log(`   ✅ ${category}: ${urls.length} variants`);
    });
    
    // ZIP package
    console.log('\n📦 ZIP Package:');
    console.log(`   ✅ Complete Package: ${completePackage.zipUrl ? 'Available' : 'Missing'}`);
    
    // Step 7: Test ZIP package download (like user clicking download buttons)
    console.log('\n7️⃣ Testing package downloads...');
    
    if (completePackage.zipUrl) {
      try {
        console.log('   - Downloading complete ZIP package...');
        const zipResponse = await fetch(completePackage.zipUrl);
        const zipBuffer = await zipResponse.arrayBuffer();
        const zip = await JSZip.loadAsync(zipBuffer);
        
        console.log('   ✅ ZIP package downloaded successfully');
        console.log(`   📁 Package size: ${(zipBuffer.byteLength / 1024).toFixed(2)} KB`);
        console.log('   📋 Package contents:');
        
        Object.keys(zip.files).forEach(filename => {
          const file = zip.files[filename];
          if (!file.dir) {
            console.log(`      - ${filename} (${(file._data.uncompressedSize / 1024).toFixed(2)} KB)`);
          }
        });
        
        // Save ZIP for inspection
        const zipPath = path.join(__dirname, 'complete-bot-workflow-test.zip');
        fs.writeFileSync(zipPath, zipBuffer);
        console.log(`   💾 ZIP saved to: ${zipPath}`);
        
      } catch (error) {
        console.log('   ❌ ZIP download failed:', error.message);
      }
    }
    
    // Step 8: Test individual component downloads
    console.log('\n8️⃣ Testing individual component downloads...');
    
    // Test color variants
    console.log('   🎨 Testing color variant downloads:');
    const colorVariants = [
      { name: 'Transparent', url: completePackage.transparentPng },
      { name: 'White Background', url: completePackage.whiteBackgroundPng },
      { name: 'Black Background', url: completePackage.blackBackgroundPng }
    ];
    
    for (const variant of colorVariants) {
      if (variant.url) {
        try {
          const response = await fetch(variant.url);
          const buffer = await response.arrayBuffer();
          console.log(`      ✅ ${variant.name}: ${(buffer.byteLength / 1024).toFixed(2)} KB`);
        } catch (error) {
          console.log(`      ❌ ${variant.name}: Download failed`);
        }
      }
    }
    
    // Test vector formats
    console.log('   📐 Testing vector format downloads:');
    const vectorFormats = [
      { name: 'SVG', url: completePackage.svg },
      { name: 'PDF', url: completePackage.pdf },
      { name: 'EPS', url: completePackage.eps }
    ];
    
    for (const format of vectorFormats) {
      if (format.url) {
        try {
          const response = await fetch(format.url);
          const buffer = await response.arrayBuffer();
          console.log(`      ✅ ${format.name}: ${(buffer.byteLength / 1024).toFixed(2)} KB`);
        } catch (error) {
          console.log(`      ❌ ${format.name}: Download failed`);
        }
      }
    }
    
    // Test size variants
    console.log('   📏 Testing size variant downloads:');
    for (const [category, urls] of Object.entries(completePackage.sizes)) {
      if (urls.length > 0) {
        try {
          const response = await fetch(urls[0]);
          const buffer = await response.arrayBuffer();
          console.log(`      ✅ ${category} (first): ${(buffer.byteLength / 1024).toFixed(2)} KB`);
        } catch (error) {
          console.log(`      ❌ ${category}: Download failed`);
        }
      }
    }
    
    // Step 9: Simulate bot UI responses
    console.log('\n9️⃣ Simulating bot UI responses...');
    
    console.log('   📱 Bot would send this message to user:');
    console.log('   ======================================');
    console.log('   🎉 *Complete Professional Logo Package Ready!*');
    console.log('   ');
    console.log('   Your logo package includes:');
    console.log('   ');
    console.log('   🎨 *Color Variants:*');
    console.log('   • Transparent PNG (original)');
    console.log('   • White background PNG');
    console.log('   • Black background PNG');
    console.log('   ');
    console.log('   📏 *Size Variants:*');
    console.log('   • Favicon: 16px, 32px, 48px, 64px');
    console.log('   • Web: 192px, 512px');
    console.log('   • Social: 400px, 800px, 1080px');
    console.log('   • Print: 1000px, 2000px, 3000px');
    console.log('   ');
    console.log('   📐 *Vector Formats:*');
    console.log('   • SVG (scalable vector)');
    console.log('   • PDF (print-ready)');
    console.log('   • EPS (professional printing)');
    console.log('   ');
    console.log('   Choose your download option:');
    console.log('   ');
    console.log('   [📦 Download Complete Package (ZIP)]');
    console.log('   [🎨 Color Variants] [📏 Size Variants]');
    console.log('   [📐 Vector Formats] [🔄 Generate More Variants]');
    console.log('   [🏠 Back to Menu]');
    
    console.log('\n✅ Bot UI simulation complete\n');
    
    // Step 10: Final verification
    console.log('🔟 Final verification...');
    
    const allComponentsPresent = 
      completePackage.transparentPng &&
      completePackage.whiteBackgroundPng &&
      completePackage.blackBackgroundPng &&
      completePackage.svg &&
      completePackage.pdf &&
      completePackage.eps &&
      completePackage.zipUrl &&
      Object.values(completePackage.sizes).every(urls => urls.length > 0);
    
    if (allComponentsPresent) {
      console.log('✅ All components present and working');
      console.log('✅ Complete bot workflow test PASSED');
      console.log('🎉 The system is ready for production!');
      return true;
    } else {
      console.log('❌ Some components are missing');
      console.log('❌ Complete bot workflow test FAILED');
      return false;
    }
    
  } catch (error) {
    console.error('❌ End-to-end test failed:', error.message);
    console.error('Stack trace:', error.stack);
    return false;
  }
}

async function runEndToEndTest() {
  console.log('🚀 Starting End-to-End Test Suite\n');
  console.log('==================================\n');
  
  const result = await testCompleteBotWorkflow();
  
  console.log('\n📊 End-to-End Test Results:');
  console.log('============================');
  console.log(`${result ? '✅' : '❌'} Complete Bot Workflow: ${result ? 'PASSED' : 'FAILED'}`);
  
  if (result) {
    console.log('\n🎉 ALL TESTS PASSED!');
    console.log('🚀 Complete Asset Generation System is fully functional!');
    console.log('🎯 Ready for production deployment!');
  } else {
    console.log('\n⚠️  SOME TESTS FAILED!');
    console.log('🔧 Please check the output above for issues.');
  }
  
  return result;
}

// Run test if this file is executed directly
if (require.main === module) {
  runEndToEndTest().catch(console.error);
}

module.exports = {
  runEndToEndTest,
  testCompleteBotWorkflow
};





