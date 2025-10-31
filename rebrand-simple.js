#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔄 BRANDFORGE → INSTALOGO REBRANDING SCRIPT');
console.log('==========================================\n');

// Files that contain BrandForge (based on our grep results)
const filesToUpdate = [
  'locales/zh.json',
  'locales/fr.json', 
  'locales/es.json',
  'locales/ru.json',
  'locales/en.json'
];

// Replacement patterns
const replacements = [
  { from: /BrandForge Bot/g, to: 'Instalogo Bot' },
  { from: /BrandForge/g, to: 'Instalogo' },
  { from: /brandforge/g, to: 'instalogo' },
  { from: /BRANDFORGE/g, to: 'INSTALOGO' },
];

function processFile(filePath) {
  console.log(`📄 Processing: ${filePath}`);
  
  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️  File not found: ${filePath}`);
    return false;
  }
  
  try {
    // Read file content
    const originalContent = fs.readFileSync(filePath, 'utf8');
    let newContent = originalContent;
    let totalChanges = 0;
    
    // Apply all replacements
    for (const replacement of replacements) {
      const beforeMatches = newContent.match(replacement.from);
      newContent = newContent.replace(replacement.from, replacement.to);
      const afterMatches = newContent.match(replacement.from);
      
      const changeCount = (beforeMatches?.length || 0) - (afterMatches?.length || 0);
      if (changeCount > 0) {
        totalChanges += changeCount;
        console.log(`  ✅ ${replacement.from.toString()} → ${replacement.to}: ${changeCount} replacements`);
      }
    }
    
    if (totalChanges > 0) {
      // Write back the modified content
      fs.writeFileSync(filePath, newContent, 'utf8');
      console.log(`  💾 Saved ${filePath} with ${totalChanges} changes\n`);
      return true;
    } else {
      console.log(`  ℹ️  No changes needed in ${filePath}\n`);
      return false;
    }
    
  } catch (error) {
    console.log(`  ❌ Error processing ${filePath}:`, error.message);
    return false;
  }
}

// Main execution
function main() {
  console.log('🔍 Starting rebranding process...\n');
  
  let filesChanged = 0;
  let totalReplacements = 0;
  
  for (const filePath of filesToUpdate) {
    const changed = processFile(filePath);
    if (changed) {
      filesChanged++;
    }
  }
  
  console.log('🎉 REBRANDING COMPLETE!');
  console.log('======================');
  console.log(`📊 Files changed: ${filesChanged}/${filesToUpdate.length}`);
  console.log('');
  
  if (filesChanged > 0) {
    console.log('📋 Next steps:');
    console.log('1. Review changes: git diff');
    console.log('2. Test build: npm run build'); 
    console.log('3. Commit: git add -A && git commit -m "rebrand: Change BrandForge to Instalogo"');
    console.log('4. Push: git push fork render-deploy');
  } else {
    console.log('✨ No changes were needed - already branded as Instalogo!');
  }
}

// Run the script
main();

