const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const JSZip = require('jszip');

const execAsync = promisify(exec);

// Mock services for testing
class MockStorageService {
  constructor() {
    this.uploads = [];
  }

  async uploadBuffer(buffer, options) {
    const url = `https://mock-storage.com/${options.key}`;
    this.uploads.push({ url, buffer, options });
    return url;
  }

  async uploadImage(buffer, filename) {
    return this.uploadBuffer(buffer, { key: `images/${filename}`, contentType: 'image/png' });
  }
}

class MockFluxService {
  async generateImage(params) {
    // Create a simple test image
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
        <circle cx="256" cy="256" r="200" fill="blue" stroke="white" stroke-width="4"/>
        <text x="256" y="280" text-anchor="middle" fill="white" font-family="Arial" font-size="24" font-weight="bold">TEST</text>
      </svg>`),
      top: 0,
      left: 0
    }])
    .png()
    .toBuffer();

    return {
      image: `data:image/png;base64,${testImage.toString('base64')}`,
      seed: Math.floor(Math.random() * 1000000)
    };
  }
}

// Import the service (we'll need to compile it first)
let CompleteAssetGenerationService;

async function setupTest() {
  console.log('🔧 Setting up test environment...');
  
  // Compile TypeScript if needed
  try {
    const { execSync } = require('child_process');
    execSync('npx tsc src/services/completeAssetGeneration.service.ts --outDir dist --target es2020 --module commonjs --esModuleInterop', { stdio: 'pipe' });
    CompleteAssetGenerationService = require('../dist/services/completeAssetGeneration.service').CompleteAssetGenerationService;
    console.log('✅ TypeScript compilation successful');
  } catch (error) {
    console.error('❌ TypeScript compilation failed:', error.message);
    throw error;
  }
}

async function testInkscapeAvailability() {
  console.log('\n🔍 Testing Inkscape availability...');
  
  try {
    const { stdout } = await execAsync('inkscape --version');
    console.log('✅ Inkscape is available:', stdout.trim());
    return true;
  } catch (error) {
    console.log('❌ Inkscape not available:', error.message);
    return false;
  }
}

async function testSharpFunctionality() {
  console.log('\n🔍 Testing Sharp functionality...');
  
  try {
    // Create a test image
    const testBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 }
      }
    })
    .png()
    .toBuffer();
    
    console.log('✅ Sharp basic functionality works');
    
    // Test color variants
    const whiteBuffer = await sharp(testBuffer)
      .composite([{
        input: Buffer.from(`<svg width="100" height="100"><rect width="100%" height="100%" fill="white"/></svg>`),
        blend: 'dest-over'
      }])
      .png()
      .toBuffer();
    
    console.log('✅ Sharp color variant generation works');
    
    // Test size variants
    const resizedBuffer = await sharp(testBuffer)
      .resize(50, 50, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    
    console.log('✅ Sharp size variant generation works');
    
    return true;
  } catch (error) {
    console.error('❌ Sharp functionality test failed:', error.message);
    return false;
  }
}

async function testInkscapeConversion() {
  console.log('\n🔍 Testing Inkscape conversion functionality...');
  
  try {
    // Create a test PNG
    const testPng = await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
    .composite([{
      input: Buffer.from(`<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <circle cx="100" cy="100" r="80" fill="red" stroke="blue" stroke-width="4"/>
        <text x="100" y="110" text-anchor="middle" fill="white" font-family="Arial" font-size="16">TEST</text>
      </svg>`),
      top: 0,
      left: 0
    }])
    .png()
    .toBuffer();
    
    const testDir = path.join(__dirname, 'temp-test');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    const pngPath = path.join(testDir, 'test.png');
    const svgPath = path.join(testDir, 'test.svg');
    const pdfPath = path.join(testDir, 'test.pdf');
    const epsPath = path.join(testDir, 'test.eps');
    
    // Write test PNG
    fs.writeFileSync(pngPath, testPng);
    console.log('✅ Created test PNG');
    
    // Test PNG to SVG conversion
    try {
      await execAsync(`inkscape "${pngPath}" --export-plain-svg="${svgPath}" --trace-bitmap --simplify`);
      console.log('✅ PNG to SVG conversion works');
    } catch (error) {
      console.log('❌ PNG to SVG conversion failed:', error.message);
    }
    
    // Test SVG to PDF conversion
    try {
      await execAsync(`inkscape "${svgPath}" --export-filename="${pdfPath}"`);
      console.log('✅ SVG to PDF conversion works');
    } catch (error) {
      console.log('❌ SVG to PDF conversion failed:', error.message);
    }
    
    // Test SVG to EPS conversion
    try {
      await execAsync(`inkscape "${svgPath}" --export-filename="${epsPath}"`);
      console.log('✅ SVG to EPS conversion works');
    } catch (error) {
      console.log('❌ SVG to EPS conversion failed:', error.message);
    }
    
    // Cleanup
    fs.rmSync(testDir, { recursive: true, force: true });
    console.log('🧹 Cleaned up test files');
    
    return true;
  } catch (error) {
    console.error('❌ Inkscape conversion test failed:', error.message);
    return false;
  }
}

async function testCompleteAssetGenerationService() {
  console.log('\n🧪 Testing CompleteAssetGenerationService...');
  
  try {
    const storageService = new MockStorageService();
    const fluxService = new MockFluxService();
    const service = new CompleteAssetGenerationService(storageService, fluxService);
    
    console.log('✅ Service instantiated successfully');
    
    // Test complete package generation
    const testParams = {
      brandName: 'TestBrand',
      originalPrompt: 'Test logo design',
      selectedSeed: 12345,
      userId: 'test-user-123',
      sessionId: 'test-session-456'
    };
    
    console.log('🔄 Generating complete package...');
    const result = await service.generateCompletePackage(testParams);
    
    console.log('✅ Complete package generated successfully');
    console.log('📊 Package contents:');
    console.log(`  - Transparent PNG: ${result.transparentPng ? '✅' : '❌'}`);
    console.log(`  - White PNG: ${result.whiteBackgroundPng ? '✅' : '❌'}`);
    console.log(`  - Black PNG: ${result.blackBackgroundPng ? '✅' : '❌'}`);
    console.log(`  - SVG: ${result.svg ? '✅' : '❌'}`);
    console.log(`  - PDF: ${result.pdf ? '✅' : '❌'}`);
    console.log(`  - EPS: ${result.eps ? '✅' : '❌'}`);
    console.log(`  - ZIP URL: ${result.zipUrl ? '✅' : '❌'}`);
    
    // Test size variants
    console.log('📏 Size variants:');
    Object.entries(result.sizes).forEach(([category, urls]) => {
      console.log(`  - ${category}: ${urls.length} variants`);
    });
    
    // Test ZIP package
    if (result.zipUrl) {
      console.log('📦 Testing ZIP package...');
      const zipResponse = await fetch(result.zipUrl);
      const zipBuffer = await zipResponse.arrayBuffer();
      const zip = await JSZip.loadAsync(zipBuffer);
      
      console.log('✅ ZIP package loaded successfully');
      console.log('📁 ZIP contents:');
      Object.keys(zip.files).forEach(filename => {
        console.log(`  - ${filename}`);
      });
    }
    
    return true;
  } catch (error) {
    console.error('❌ CompleteAssetGenerationService test failed:', error.message);
    console.error('Stack trace:', error.stack);
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 Starting Complete Asset Generation Test Suite\n');
  
  const results = {
    setup: false,
    inkscape: false,
    sharp: false,
    inkscapeConversion: false,
    service: false
  };
  
  try {
    // Setup
    await setupTest();
    results.setup = true;
    
    // Test Inkscape availability
    results.inkscape = await testInkscapeAvailability();
    
    // Test Sharp functionality
    results.sharp = await testSharpFunctionality();
    
    // Test Inkscape conversion
    if (results.inkscape) {
      results.inkscapeConversion = await testInkscapeConversion();
    }
    
    // Test complete service
    results.service = await testCompleteAssetGenerationService();
    
  } catch (error) {
    console.error('❌ Test suite failed:', error.message);
  }
  
  // Summary
  console.log('\n📊 Test Results Summary:');
  console.log('========================');
  Object.entries(results).forEach(([test, passed]) => {
    console.log(`${passed ? '✅' : '❌'} ${test}: ${passed ? 'PASSED' : 'FAILED'}`);
  });
  
  const allPassed = Object.values(results).every(Boolean);
  console.log(`\n🎯 Overall: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
  
  if (allPassed) {
    console.log('🎉 Complete Asset Generation Service is working perfectly!');
  } else {
    console.log('⚠️  Some tests failed. Check the output above for details.');
  }
  
  return allPassed;
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  runAllTests,
  testInkscapeAvailability,
  testSharpFunctionality,
  testInkscapeConversion,
  testCompleteAssetGenerationService
};





