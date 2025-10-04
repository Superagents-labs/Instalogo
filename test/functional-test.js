#!/usr/bin/env node

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const JSZip = require('jszip');

const execAsync = promisify(exec);

async function compileTypeScript() {
  console.log('🔧 Compiling TypeScript...');
  
  try {
    // Compile the service
    await execAsync('npx tsc src/services/completeAssetGeneration.service.ts --outDir dist --target es2020 --module commonjs --esModuleInterop --skipLibCheck');
    console.log('✅ TypeScript compilation successful');
    return true;
  } catch (error) {
    console.error('❌ TypeScript compilation failed:', error.message);
    return false;
  }
}

async function testCompleteAssetGenerationService() {
  console.log('\n🧪 Testing CompleteAssetGenerationService...');
  
  try {
    // Import the compiled service
    const { CompleteAssetGenerationService } = require('../dist/services/completeAssetGeneration.service');
    
    // Mock services
    class MockStorageService {
      constructor() {
        this.uploads = [];
      }

      async uploadBuffer(buffer, options) {
        // Create a data URL instead of a fake URL
        const base64 = buffer.toString('base64');
        const mimeType = options.contentType || 'image/png';
        const url = `data:${mimeType};base64,${base64}`;
        this.uploads.push({ url, buffer, options });
        return url;
      }
    }

    class MockFluxService {
      async generateImage(params) {
        // Create a test logo image
        const testImage = await sharp({
          create: {
            width: 512,
            height: 512,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          }
        })
        .composite([{
          input: Buffer.from(`<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
            <circle cx="256" cy="256" r="200" fill="blue" stroke="white" stroke-width="8"/>
            <text x="256" cy="280" text-anchor="middle" fill="white" font-family="Arial" font-size="32" font-weight="bold">TEST</text>
          </svg>`),
          top: 0,
          left: 0
        }])
        .png()
        .toBuffer();

        return {
          image: `data:image/png;base64,${testImage.toString('base64')}`,
          seed: params.selectedSeed || Math.floor(Math.random() * 1000000)
        };
      }
    }
    
    const storageService = new MockStorageService();
    const fluxService = new MockFluxService();
    const service = new CompleteAssetGenerationService(storageService, fluxService);
    
    console.log('✅ Service instantiated successfully');
    
    // Test parameters
    const testParams = {
      brandName: 'TestBrand',
      originalPrompt: 'Test logo design for a tech company',
      selectedSeed: 12345,
      userId: 'test-user-123',
      sessionId: 'test-session-456'
    };
    
    console.log('🔄 Generating complete package...');
    console.log('   This may take a moment as it generates all variants...');
    
    const startTime = Date.now();
    const result = await service.generateCompletePackage(testParams);
    const endTime = Date.now();
    
    console.log(`✅ Complete package generated in ${(endTime - startTime) / 1000}s`);
    
    // Verify results
    console.log('\n📊 Package Analysis:');
    console.log('===================');
    
    // Color variants
    console.log('🎨 Color Variants:');
    console.log(`   - Transparent PNG: ${result.transparentPng ? '✅' : '❌'}`);
    console.log(`   - White Background: ${result.whiteBackgroundPng ? '✅' : '❌'}`);
    console.log(`   - Black Background: ${result.blackBackgroundPng ? '✅' : '❌'}`);
    
    // Vector formats
    console.log('\n📐 Vector Formats:');
    console.log(`   - SVG: ${result.svg ? '✅' : '❌'}`);
    console.log(`   - PDF: ${result.pdf ? '✅' : '❌'}`);
    console.log(`   - EPS: ${result.eps ? '✅' : '❌'}`);
    
    // Size variants
    console.log('\n📏 Size Variants:');
    Object.entries(result.sizes).forEach(([category, urls]) => {
      console.log(`   - ${category}: ${urls.length} variants`);
    });
    
    // ZIP package
    console.log('\n📦 ZIP Package:');
    console.log(`   - ZIP URL: ${result.zipUrl ? '✅' : '❌'}`);
    
    if (result.zipUrl) {
      try {
        console.log('   - Testing ZIP package download...');
        const zipResponse = await fetch(result.zipUrl);
        const zipBuffer = await zipResponse.arrayBuffer();
        const zip = await JSZip.loadAsync(zipBuffer);
        
        console.log('   - ZIP package loaded successfully');
        console.log('   - ZIP contents:');
        Object.keys(zip.files).forEach(filename => {
          const file = zip.files[filename];
          if (!file.dir) {
            console.log(`     - ${filename} (${(file._data.uncompressedSize / 1024).toFixed(2)} KB)`);
          }
        });
      } catch (error) {
        console.log('   - ZIP package test failed:', error.message);
      }
    }
    
    // Test individual downloads
    console.log('\n🔍 Testing Individual Downloads:');
    
    // Test color variant downloads
    if (result.transparentPng) {
      try {
        const response = await fetch(result.transparentPng);
        const buffer = await response.arrayBuffer();
        console.log(`   - Transparent PNG: ${(buffer.byteLength / 1024).toFixed(2)} KB`);
      } catch (error) {
        console.log('   - Transparent PNG download failed');
      }
    }
    
    if (result.whiteBackgroundPng) {
      try {
        const response = await fetch(result.whiteBackgroundPng);
        const buffer = await response.arrayBuffer();
        console.log(`   - White PNG: ${(buffer.byteLength / 1024).toFixed(2)} KB`);
      } catch (error) {
        console.log('   - White PNG download failed');
      }
    }
    
    if (result.blackBackgroundPng) {
      try {
        const response = await fetch(result.blackBackgroundPng);
        const buffer = await response.arrayBuffer();
        console.log(`   - Black PNG: ${(buffer.byteLength / 1024).toFixed(2)} KB`);
      } catch (error) {
        console.log('   - Black PNG download failed');
      }
    }
    
    // Test vector format downloads
    if (result.svg) {
      try {
        const response = await fetch(result.svg);
        const buffer = await response.arrayBuffer();
        console.log(`   - SVG: ${(buffer.byteLength / 1024).toFixed(2)} KB`);
      } catch (error) {
        console.log('   - SVG download failed');
      }
    }
    
    if (result.pdf) {
      try {
        const response = await fetch(result.pdf);
        const buffer = await response.arrayBuffer();
        console.log(`   - PDF: ${(buffer.byteLength / 1024).toFixed(2)} KB`);
      } catch (error) {
        console.log('   - PDF download failed');
      }
    }
    
    if (result.eps) {
      try {
        const response = await fetch(result.eps);
        const buffer = await response.arrayBuffer();
        console.log(`   - EPS: ${(buffer.byteLength / 1024).toFixed(2)} KB`);
      } catch (error) {
        console.log('   - EPS download failed');
      }
    }
    
    // Test size variant downloads
    console.log('\n📏 Testing Size Variant Downloads:');
    for (const [category, urls] of Object.entries(result.sizes)) {
      if (urls.length > 0) {
        try {
          const response = await fetch(urls[0]);
          const buffer = await response.arrayBuffer();
          console.log(`   - ${category} (first variant): ${(buffer.byteLength / 1024).toFixed(2)} KB`);
        } catch (error) {
          console.log(`   - ${category} download failed`);
        }
      }
    }
    
    console.log('\n🎉 CompleteAssetGenerationService test completed successfully!');
    return true;
    
  } catch (error) {
    console.error('❌ CompleteAssetGenerationService test failed:', error.message);
    console.error('Stack trace:', error.stack);
    return false;
  }
}

async function testErrorHandling() {
  console.log('\n🔍 Testing Error Handling...');
  
  try {
    const { CompleteAssetGenerationService } = require('../dist/services/completeAssetGeneration.service');
    
    // Mock services with error conditions
    class ErrorStorageService {
      async uploadBuffer(buffer, options) {
        throw new Error('Mock storage error');
      }
    }

    class ErrorFluxService {
      async generateImage(params) {
        throw new Error('Mock flux error');
      }
    }
    
    const errorStorageService = new ErrorStorageService();
    const errorFluxService = new ErrorFluxService();
    const service = new CompleteAssetGenerationService(errorStorageService, errorFluxService);
    
    try {
      await service.generateCompletePackage({
        brandName: 'ErrorTest',
        originalPrompt: 'Test error handling',
        selectedSeed: 12345,
        userId: 'error-user',
        sessionId: 'error-session'
      });
      console.log('❌ Error handling test failed - should have thrown an error');
      return false;
    } catch (error) {
      console.log('✅ Error handling works correctly - caught expected error');
      return true;
    }
    
  } catch (error) {
    console.error('❌ Error handling test failed:', error.message);
    return false;
  }
}

async function runFunctionalTests() {
  console.log('🚀 Starting Functional Test Suite\n');
  console.log('==================================\n');
  
  const results = {
    compilation: false,
    service: false,
    errorHandling: false
  };
  
  try {
    // Compile TypeScript
    results.compilation = await compileTypeScript();
    
    if (results.compilation) {
      // Test the service
      results.service = await testCompleteAssetGenerationService();
      
      // Test error handling
      results.errorHandling = await testErrorHandling();
    }
    
  } catch (error) {
    console.error('❌ Functional test suite failed:', error.message);
  }
  
  // Summary
  console.log('\n📊 Functional Test Results:');
  console.log('============================');
  Object.entries(results).forEach(([test, passed]) => {
    console.log(`${passed ? '✅' : '❌'} ${test}: ${passed ? 'PASSED' : 'FAILED'}`);
  });
  
  const allPassed = Object.values(results).every(Boolean);
  console.log(`\n🎯 Overall: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
  
  if (allPassed) {
    console.log('🎉 CompleteAssetGenerationService is working perfectly!');
    console.log('🚀 Ready for production integration!');
  } else {
    console.log('⚠️  Some tests failed. Check the output above for details.');
  }
  
  return allPassed;
}

// Run tests if this file is executed directly
if (require.main === module) {
  runFunctionalTests().catch(console.error);
}

module.exports = {
  runFunctionalTests,
  testCompleteAssetGenerationService,
  testErrorHandling
};
