import fs from 'fs';
import { execSync } from 'child_process';

try {
  const gitHash = execSync('git rev-parse --short HEAD').toString().trim();
  const buildTime = new Date().toISOString();
  const branch = execSync('git branch --show-current').toString().trim();

  const versionInfo = {
    version: gitHash,
    buildTime,
    branch
  };

  // For public repo: write to public/js/core/version.js (same structure as dev repo)
  fs.writeFileSync('./public/js/core/version.js', 
    `export const VERSION_INFO = ${JSON.stringify(versionInfo, null, 2)};`
  );
  
  console.log(`✅ Version ${gitHash} ready for deployment from public repo`);
} catch (error) {
  console.error('❌ Version generation failed:', error.message);
  process.exit(1);
}