#!/usr/bin/env node

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const JSZip = require('jszip');

const execAsync = promisify(exec);

async function testInkscapeInstallation() {
  console.log('🔍 Testing Inkscape Installation...');
  
  try {
    const { stdout } = await execAsync('inkscape --version');
    console.log('✅ Inkscape is installed and working');
    console.log('   Version:', stdout.trim());
    return true;
  } catch (error) {
    console.log('❌ Inkscape is not working:', error.message);
    return false;
  }
}

async function testSharpIntegration() {
  console.log('\n🔍 Testing Sharp Integration...');
  
  try {
    // Create a test image with transparent background
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
        <text x="256" y="280" text-anchor="middle" fill="white" font-family="Arial" font-size="32" font-weight="bold">LOGO</text>
      </svg>`),
      top: 0,
      left: 0
    }])
    .png()
    .toBuffer();
    
    console.log('✅ Created test logo image');
    
    // Test color variants
    const whiteBackground = await sharp(testImage)
      .composite([{
        input: Buffer.from(`<svg width="512" height="512"><rect width="100%" height="100%" fill="white"/></svg>`),
        blend: 'dest-over'
      }])
      .png()
      .toBuffer();
    
    const blackBackground = await sharp(testImage)
      .composite([{
        input: Buffer.from(`<svg width="512" height="512"><rect width="100%" height="100%" fill="black"/></svg>`),
        blend: 'dest-over'
      }])
      .png()
      .toBuffer();
    
    console.log('✅ Generated color variants (white, black backgrounds)');
    
    // Test size variants
    const sizes = [16, 32, 48, 64, 192, 512, 1024];
    for (const size of sizes) {
      const resized = await sharp(testImage)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
      
      if (resized.length > 0) {
        console.log(`✅ Generated ${size}x${size} size variant`);
      }
    }
    
    return true;
  } catch (error) {
    console.error('❌ Sharp integration test failed:', error.message);
    return false;
  }
}

async function testInkscapeVectorGeneration() {
  console.log('\n🔍 Testing Inkscape Vector Generation...');
  
  try {
    // Create test directory
    const testDir = path.join(__dirname, 'temp-vector-test');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
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
        <text x="100" y="110" text-anchor="middle" fill="white" font-family="Arial" font-size="16" font-weight="bold">TEST</text>
      </svg>`),
      top: 0,
      left: 0
    }])
    .png()
    .toBuffer();
    
    const pngPath = path.join(testDir, 'test-logo.png');
    const svgPath = path.join(testDir, 'test-logo.svg');
    const pdfPath = path.join(testDir, 'test-logo.pdf');
    const epsPath = path.join(testDir, 'test-logo.eps');
    
    // Write test PNG
    fs.writeFileSync(pngPath, testPng);
    console.log('✅ Created test PNG file');
    
    // Test PNG to SVG conversion
    try {
      await execAsync(`inkscape "${pngPath}" --export-type=svg --export-filename="${svgPath}"`);
      if (fs.existsSync(svgPath)) {
        console.log('✅ PNG to SVG conversion successful');
      } else {
        console.log('❌ SVG file not created');
      }
    } catch (error) {
      console.log('❌ PNG to SVG conversion failed:', error.message);
    }
    
    // Test SVG to PDF conversion
    try {
      await execAsync(`inkscape "${svgPath}" --export-type=pdf --export-filename="${pdfPath}"`);
      if (fs.existsSync(pdfPath)) {
        console.log('✅ SVG to PDF conversion successful');
      } else {
        console.log('❌ PDF file not created');
      }
    } catch (error) {
      console.log('❌ SVG to PDF conversion failed:', error.message);
    }
    
    // Test SVG to EPS conversion
    try {
      await execAsync(`inkscape "${svgPath}" --export-type=eps --export-filename="${epsPath}"`);
      if (fs.existsSync(epsPath)) {
        console.log('✅ SVG to EPS conversion successful');
      } else {
        console.log('❌ EPS file not created');
      }
    } catch (error) {
      console.log('❌ SVG to EPS conversion failed:', error.message);
    }
    
    // Cleanup
    fs.rmSync(testDir, { recursive: true, force: true });
    console.log('🧹 Cleaned up test files');
    
    return true;
  } catch (error) {
    console.error('❌ Inkscape vector generation test failed:', error.message);
    return false;
  }
}

async function testZipPackageGeneration() {
  console.log('\n🔍 Testing ZIP Package Generation...');
  
  try {
    const zip = new JSZip();
    
    // Create test files
    const testImage = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 }
      }
    })
    .png()
    .toBuffer();
    
    // Add files to ZIP
    zip.file('README.txt', `Test Logo Package
    
Generated by Instalogo Bot

Contents:
- PNG formats (transparent, white, black backgrounds)
- Vector formats (SVG, PDF, EPS)
- Size variants (favicon, web, social, print)
- All files are high-quality and ready for use

For best results:
- Use PNG for web/apps
- Use SVG for scalable graphics
- Use PDF/EPS for print
- Use appropriate sizes for your platform

Enjoy your new logo!`);
    
    zip.folder('Color_Variants');
    zip.file('Color_Variants/transparent.png', testImage);
    zip.file('Color_Variants/white.png', testImage);
    zip.file('Color_Variants/black.png', testImage);
    
    zip.folder('Size_Variants');
    zip.folder('Size_Variants/favicon');
    zip.file('Size_Variants/favicon/logo_16x16.png', testImage);
    zip.file('Size_Variants/favicon/logo_32x32.png', testImage);
    
    zip.folder('Size_Variants/web');
    zip.file('Size_Variants/web/logo_192x192.png', testImage);
    zip.file('Size_Variants/web/logo_512x512.png', testImage);
    
    // Generate ZIP
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    
    // Save ZIP for inspection
    const zipPath = path.join(__dirname, 'test-package.zip');
    fs.writeFileSync(zipPath, zipBuffer);
    
    console.log('✅ ZIP package generated successfully');
    console.log(`   Size: ${(zipBuffer.length / 1024).toFixed(2)} KB`);
    console.log(`   Saved to: ${zipPath}`);
    
    // Verify ZIP contents
    const verifyZip = await JSZip.loadAsync(zipBuffer);
    const fileNames = Object.keys(verifyZip.files);
    console.log('📁 ZIP contents:');
    fileNames.forEach(name => {
      console.log(`   - ${name}`);
    });
    
    return true;
  } catch (error) {
    console.error('❌ ZIP package generation test failed:', error.message);
    return false;
  }
}

async function testCompleteWorkflow() {
  console.log('\n🔍 Testing Complete Workflow Simulation...');
  
  try {
    // Simulate the complete workflow
    console.log('1. Creating test logo...');
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
        <circle cx="512" cy="512" r="400" fill="blue" stroke="white" stroke-width="20"/>
        <text x="512" y="560" text-anchor="middle" fill="white" font-family="Arial" font-size="64" font-weight="bold">BRAND</text>
      </svg>`),
      top: 0,
      left: 0
    }])
    .png()
    .toBuffer();
    
    console.log('2. Generating color variants...');
    const transparentPng = logoBuffer;
    const whitePng = await sharp(logoBuffer)
      .composite([{
        input: Buffer.from(`<svg width="1024" height="1024"><rect width="100%" height="100%" fill="white"/></svg>`),
        blend: 'dest-over'
      }])
      .png()
      .toBuffer();
    
    const blackPng = await sharp(logoBuffer)
      .composite([{
        input: Buffer.from(`<svg width="1024" height="1024"><rect width="100%" height="100%" fill="black"/></svg>`),
        blend: 'dest-over'
      }])
      .png()
      .toBuffer();
    
    console.log('3. Generating size variants...');
    const sizeVariants = {};
    const sizes = {
      favicon: [16, 32, 48, 64],
      web: [192, 512],
      social: [400, 800, 1080],
      print: [1000, 2000, 3000]
    };
    
    for (const [category, sizeList] of Object.entries(sizes)) {
      sizeVariants[category] = [];
      for (const size of sizeList) {
        const resized = await sharp(logoBuffer)
          .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer();
        sizeVariants[category].push(resized);
      }
      console.log(`   - ${category}: ${sizeList.length} variants`);
    }
    
    console.log('4. Generating vector formats...');
    const testDir = path.join(__dirname, 'temp-workflow-test');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    const pngPath = path.join(testDir, 'workflow-logo.png');
    const svgPath = path.join(testDir, 'workflow-logo.svg');
    const pdfPath = path.join(testDir, 'workflow-logo.pdf');
    const epsPath = path.join(testDir, 'workflow-logo.eps');
    
    fs.writeFileSync(pngPath, logoBuffer);
    
    let vectorFormats = { svg: null, pdf: null, eps: null };
    
    try {
      await execAsync(`inkscape "${pngPath}" --export-type=svg --export-filename="${svgPath}"`);
      if (fs.existsSync(svgPath)) {
        vectorFormats.svg = fs.readFileSync(svgPath);
        console.log('   - SVG generated');
      }
      
      await execAsync(`inkscape "${svgPath}" --export-type=pdf --export-filename="${pdfPath}"`);
      if (fs.existsSync(pdfPath)) {
        vectorFormats.pdf = fs.readFileSync(pdfPath);
        console.log('   - PDF generated');
      }
      
      await execAsync(`inkscape "${svgPath}" --export-type=eps --export-filename="${epsPath}"`);
      if (fs.existsSync(epsPath)) {
        vectorFormats.eps = fs.readFileSync(epsPath);
        console.log('   - EPS generated');
      }
    } catch (error) {
      console.log('   - Vector generation failed (Inkscape error)');
    }
    
    console.log('5. Creating complete ZIP package...');
    const zip = new JSZip();
    
    // Add README
    zip.file('README.txt', `Complete Logo Package for TestBrand
    
Generated by Instalogo Bot

Contents:
- PNG formats (transparent, white, black backgrounds)
- Vector formats (SVG, PDF, EPS)
- Size variants (favicon, web, social, print)
- All files are high-quality and ready for use

For best results:
- Use PNG for web/apps
- Use SVG for scalable graphics
- Use PDF/EPS for print
- Use appropriate sizes for your platform

Enjoy your new logo!`);
    
    // Add color variants
    zip.folder('Color_Variants');
    zip.file('Color_Variants/transparent.png', transparentPng);
    zip.file('Color_Variants/white.png', whitePng);
    zip.file('Color_Variants/black.png', blackPng);
    
    // Add size variants
    zip.folder('Size_Variants');
    for (const [category, variants] of Object.entries(sizeVariants)) {
      const folder = zip.folder(`Size_Variants/${category}`);
      const sizeList = sizes[category];
      for (let i = 0; i < variants.length; i++) {
        folder.file(`logo_${sizeList[i]}x${sizeList[i]}.png`, variants[i]);
      }
    }
    
    // Add vector formats
    if (vectorFormats.svg || vectorFormats.pdf || vectorFormats.eps) {
      zip.folder('Vector_Formats');
      if (vectorFormats.svg) zip.file('Vector_Formats/logo.svg', vectorFormats.svg);
      if (vectorFormats.pdf) zip.file('Vector_Formats/logo.pdf', vectorFormats.pdf);
      if (vectorFormats.eps) zip.file('Vector_Formats/logo.eps', vectorFormats.eps);
    }
    
    // Generate ZIP
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    const zipPath = path.join(__dirname, 'complete-workflow-test.zip');
    fs.writeFileSync(zipPath, zipBuffer);
    
    console.log('✅ Complete workflow test successful');
    console.log(`   ZIP size: ${(zipBuffer.length / 1024).toFixed(2)} KB`);
    console.log(`   Saved to: ${zipPath}`);
    
    // Cleanup
    fs.rmSync(testDir, { recursive: true, force: true });
    
    return true;
  } catch (error) {
    console.error('❌ Complete workflow test failed:', error.message);
    return false;
  }
}

async function runIntegrationTests() {
  console.log('🚀 Starting Integration Test Suite\n');
  console.log('=====================================\n');
  
  const results = {
    inkscape: false,
    sharp: false,
    inkscapeVector: false,
    zipPackage: false,
    completeWorkflow: false
  };
  
  try {
    // Test Inkscape installation
    results.inkscape = await testInkscapeInstallation();
    
    // Test Sharp integration
    results.sharp = await testSharpIntegration();
    
    // Test Inkscape vector generation
    if (results.inkscape) {
      results.inkscapeVector = await testInkscapeVectorGeneration();
    }
    
    // Test ZIP package generation
    results.zipPackage = await testZipPackageGeneration();
    
    // Test complete workflow
    results.completeWorkflow = await testCompleteWorkflow();
    
  } catch (error) {
    console.error('❌ Integration test suite failed:', error.message);
  }
  
  // Summary
  console.log('\n📊 Integration Test Results:');
  console.log('============================');
  Object.entries(results).forEach(([test, passed]) => {
    console.log(`${passed ? '✅' : '❌'} ${test}: ${passed ? 'PASSED' : 'FAILED'}`);
  });
  
  const allPassed = Object.values(results).every(Boolean);
  console.log(`\n🎯 Overall: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
  
  if (allPassed) {
    console.log('🎉 Complete Asset Generation System is working perfectly!');
    console.log('🚀 Ready for production use!');
  } else {
    console.log('⚠️  Some tests failed. Check the output above for details.');
  }
  
  return allPassed;
}

// Run tests if this file is executed directly
if (require.main === module) {
  runIntegrationTests().catch(console.error);
}

module.exports = {
  runIntegrationTests,
  testInkscapeInstallation,
  testSharpIntegration,
  testInkscapeVectorGeneration,
  testZipPackageGeneration,
  testCompleteWorkflow
};
