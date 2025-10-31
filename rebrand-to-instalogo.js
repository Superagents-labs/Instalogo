#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const glob = require('glob');

console.log('🔄 BRANDFORGE → INSTALOGO REBRANDING SCRIPT');
console.log('==========================================\n');

// Define replacement patterns
const replacements = [
  { from: /BrandForge/g, to: 'Instalogo', description: 'BrandForge → Instalogo' },
  { from: /brandforge/g, to: 'instalogo', description: 'brandforge → instalogo' },
  { from: /BRANDFORGE/g, to: 'INSTALOGO', description: 'BRANDFORGE → INSTALOGO' },
  { from: /BrandForge Bot/g, to: 'Instalogo Bot', description: 'BrandForge Bot → Instalogo Bot' },
];

// File patterns to search (excluding node_modules, dist, .git)
const searchPatterns = [
  'src/**/*.ts',
  'src/**/*.js', 
  'locales/*.json',
  '*.md',
  '*.json',
  '*.txt',
  '*.yml',
  '*.yaml'
];

// Files to exclude
const excludePatterns = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.git/**',
  '**/package-lock.json',
  '**/.render-build'
];

function shouldProcessFile(filePath) {
  // Check if file should be excluded
  for (const exclude of excludePatterns) {
    if (filePath.includes(exclude.replace('**/', '').replace('/**', ''))) {
      return false;
    }
  }
  return true;
}

function findAllFiles() {
  const allFiles = [];
  
  for (const pattern of searchPatterns) {
    try {
      const files = glob.sync(pattern, { 
        cwd: process.cwd(),
        ignore: excludePatterns 
      });
      allFiles.push(...files);
    } catch (error) {
      console.log(`⚠️  Error searching pattern ${pattern}:`, error.message);
    }
  }
  
  // Remove duplicates and filter
  return [...new Set(allFiles)].filter(shouldProcessFile);
}

function analyzeFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return { hasMatches: false, matches: [] };
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const matches = [];
    
    for (const replacement of replacements) {
      const found = content.match(replacement.from);
      if (found) {
        matches.push({
          pattern: replacement.description,
          count: found.length,
          examples: found.slice(0, 3) // Show first 3 examples
        });
      }
    }
    
    return {
      hasMatches: matches.length > 0,
      matches,
      originalContent: content
    };
  } catch (error) {
    console.log(`⚠️  Error reading ${filePath}:`, error.message);
    return { hasMatches: false, matches: [] };
  }
}

function performReplacements(filePath, originalContent) {
  let newContent = originalContent;
  let totalReplacements = 0;
  
  for (const replacement of replacements) {
    const beforeCount = (newContent.match(replacement.from) || []).length;
    newContent = newContent.replace(replacement.from, replacement.to);
    const afterCount = (newContent.match(replacement.from) || []).length;
    
    const replaced = beforeCount - afterCount;
    if (replaced > 0) {
      totalReplacements += replaced;
      console.log(`    ✅ ${replacement.description}: ${replaced} replacements`);
    }
  }
  
  return { newContent, totalReplacements };
}

// Main execution
function main() {
  console.log('🔍 Step 1: Scanning files for BrandForge references...\n');
  
  const allFiles = findAllFiles();
  const filesToProcess = [];
  
  console.log(`📁 Found ${allFiles.length} files to scan\n`);
  
  // Analyze all files
  for (const filePath of allFiles) {
    const analysis = analyzeFile(filePath);
    
    if (analysis.hasMatches) {
      filesToProcess.push({ filePath, analysis });
      
      console.log(`📄 ${filePath}:`);
      for (const match of analysis.matches) {
        console.log(`    🎯 ${match.pattern}: ${match.count} occurrences`);
        if (match.examples.length > 0) {
          console.log(`       Examples: ${match.examples.join(', ')}`);
        }
      }
      console.log('');
    }
  }
  
  if (filesToProcess.length === 0) {
    console.log('✨ No BrandForge references found! Already rebranded or clean repo.');
    return;
  }
  
  console.log(`\n🎯 Summary: Found BrandForge references in ${filesToProcess.length} files\n`);
  
  // Perform replacements
  console.log('🔄 Step 2: Performing replacements...\n');
  
  let totalFilesChanged = 0;
  let totalReplacements = 0;
  
  for (const { filePath, analysis } of filesToProcess) {
    console.log(`📝 Processing: ${filePath}`);
    
    const result = performReplacements(filePath, analysis.originalContent);
    
    if (result.totalReplacements > 0) {
      // Write the new content
      try {
        fs.writeFileSync(filePath, result.newContent, 'utf8');
        console.log(`    ✅ Successfully updated ${filePath} (${result.totalReplacements} changes)`);
        totalFilesChanged++;
        totalReplacements += result.totalReplacements;
      } catch (error) {
        console.log(`    ❌ Error writing ${filePath}:`, error.message);
      }
    } else {
      console.log(`    ⚠️  No changes needed in ${filePath}`);
    }
    
    console.log('');
  }
  
  // Final summary
  console.log('🎉 REBRANDING COMPLETE!');
  console.log('====================');
  console.log(`📊 Files processed: ${totalFilesChanged}`);
  console.log(`🔄 Total replacements: ${totalReplacements}`);
  console.log('');
  
  if (totalReplacements > 0) {
    console.log('📋 Next steps:');
    console.log('1. Review the changes: git diff');
    console.log('2. Test the build: npm run build');
    console.log('3. Commit the changes: git add -A && git commit -m "rebrand: Change BrandForge to Instalogo"');
    console.log('4. Push to repository: git push fork render-deploy');
  }
}

// Check if running as script
if (require.main === module) {
  main();
}

module.exports = { main, replacements, findAllFiles, analyzeFile, performReplacements };

