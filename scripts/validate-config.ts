#!/usr/bin/env ts-node

import { platformConfigManager } from '../src/config/platforms.config';
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.production' });

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  summary: any;
}

async function validateConfiguration(): Promise<ValidationResult> {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    summary: {},
  };

  console.log('🔍 Validating Postmaster platform configuration...\n');

  try {
    // Try to load configuration
    const config = platformConfigManager.loadConfig();
    result.summary = platformConfigManager.getConfigSummary();

    console.log('✅ Configuration file loaded successfully');
    console.log(`📁 Config path: ${result.summary.configPath}`);
    console.log(`🎯 Total active platforms: ${result.summary.totalActivePlatforms}`);
    console.log(`📊 Total active targets: ${result.summary.totalActiveTargets}\n`);

    // Check if any platforms are configured
    if (!platformConfigManager.hasConfiguredPlatforms()) {
      result.errors.push('No platforms are configured');
      result.valid = false;
    }

    // Validate each platform
    const activePlatforms = platformConfigManager.getActivePlatforms();
    
    for (const platform of activePlatforms) {
      console.log(`🔧 Validating ${platform} configuration:`);
      
      const targets = platformConfigManager.getPlatformConfig(platform);
      const activeTargets = targets.filter(t => t.active !== false);
      
      if (activeTargets.length === 0) {
        result.warnings.push(`Platform ${platform} has no active targets`);
        console.log(`  ⚠️  No active targets`);
        continue;
      }

      for (const target of activeTargets) {
        const targetErrors = validatePlatformTarget(platform, target);
        if (targetErrors.length > 0) {
          result.errors.push(...targetErrors.map(err => `${platform}[${target.name}]: ${err}`));
          result.valid = false;
          console.log(`  ❌ ${target.name}: ${targetErrors.join(', ')}`);
        } else {
          console.log(`  ✅ ${target.name}: OK`);
        }
      }
      
      console.log(`  📈 Active targets: ${activeTargets.length}/${targets.length}\n`);
    }

    // Check environment variables
    console.log('🌍 Checking environment variables:');
    const envErrors = checkEnvironmentVariables(activePlatforms);
    if (envErrors.length > 0) {
      result.warnings.push(...envErrors);
      envErrors.forEach(err => console.log(`  ⚠️  ${err}`));
    } else {
      console.log('  ✅ All required environment variables are set\n');
    }

  } catch (error) {
    result.errors.push(`Configuration loading failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    result.valid = false;
    console.log(`❌ Configuration loading failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return result;
}

function validatePlatformTarget(platform: string, target: any): string[] {
  const errors: string[] = [];

  // Common validations
  if (!target.name) {
    errors.push('Missing name');
  }

  if (target.rate_limit && (target.rate_limit < 1 || target.rate_limit > 1000)) {
    errors.push('Rate limit must be between 1 and 1000');
  }

  // Platform-specific validations
  switch (platform) {
    case 'slack':
    case 'discord':
      if (!target.webhook_url) {
        errors.push('Missing webhook_url');
      } else if (!target.webhook_url.startsWith('http')) {
        errors.push('Invalid webhook_url format');
      }
      break;

    case 'telegram':
      if (!target.bot_token) {
        errors.push('Missing bot_token');
      }
      if (!target.chat_id) {
        errors.push('Missing chat_id');
      }
      break;

    case 'twitter':
      const requiredFields = ['api_key', 'api_secret', 'access_token', 'access_secret'];
      for (const field of requiredFields) {
        if (!target[field]) {
          errors.push(`Missing ${field}`);
        }
      }
      break;
  }

  return errors;
}

function checkEnvironmentVariables(platforms: string[]): string[] {
  const warnings: string[] = [];

  for (const platform of platforms) {
    switch (platform) {
      case 'slack':
        if (!process.env.SLACK_WEBHOOK_URL) {
          warnings.push('SLACK_WEBHOOK_URL environment variable not set');
        }
        break;

      case 'discord':
        if (!process.env.DISCORD_WEBHOOK_URL) {
          warnings.push('DISCORD_WEBHOOK_URL environment variable not set');
        }
        break;

      case 'telegram':
        if (!process.env.TELEGRAM_BOT_TOKEN) {
          warnings.push('TELEGRAM_BOT_TOKEN environment variable not set');
        }
        if (!process.env.TELEGRAM_CHAT_ID) {
          warnings.push('TELEGRAM_CHAT_ID environment variable not set');
        }
        break;

      case 'twitter':
        const twitterVars = ['TWITTER_API_KEY', 'TWITTER_API_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_SECRET'];
        for (const varName of twitterVars) {
          if (!process.env[varName]) {
            warnings.push(`${varName} environment variable not set`);
          }
        }
        break;
    }
  }

  return warnings;
}

function printSummary(result: ValidationResult): void {
  console.log('📋 Validation Summary:');
  console.log('='.repeat(50));
  
  if (result.valid) {
    console.log('✅ Configuration is VALID');
  } else {
    console.log('❌ Configuration is INVALID');
  }
  
  console.log(`📊 Platforms: ${result.summary.totalActivePlatforms || 0}`);
  console.log(`🎯 Targets: ${result.summary.totalActiveTargets || 0}`);
  console.log(`❌ Errors: ${result.errors.length}`);
  console.log(`⚠️  Warnings: ${result.warnings.length}`);
  
  if (result.errors.length > 0) {
    console.log('\n❌ Errors:');
    result.errors.forEach(error => console.log(`  • ${error}`));
  }
  
  if (result.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    result.warnings.forEach(warning => console.log(`  • ${warning}`));
  }

  if (result.valid) {
    console.log('\n🚀 Your configuration is ready for deployment!');
  } else {
    console.log('\n🔧 Please fix the errors above before deploying.');
  }
}

// Main execution
async function main() {
  try {
    const result = await validateConfiguration();
    printSummary(result);
    
    // Exit with appropriate code
    process.exit(result.valid ? 0 : 1);
    
  } catch (error) {
    console.error('💥 Validation script failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { validateConfiguration };
