import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import { workerLogger } from '../utils/logger';

export interface PlatformTargetConfig {
  name: string;
  webhook_url?: string;
  rate_limit?: number;
  active?: boolean;
  config?: Record<string, any>;
  // Platform-specific fields
  channels?: string[];
  // Twitter specific
  api_key?: string;
  api_secret?: string;
  access_token?: string;
  access_secret?: string;
  bearer_token?: string;
  // Telegram specific
  bot_token?: string;
  chat_id?: string;
}

export interface PlatformConfig {
  [platform: string]: PlatformTargetConfig[];
}

export interface PostmasterConfig {
  platforms: PlatformConfig;
  defaults?: {
    rate_limits?: Record<string, number>;
    retry_config?: {
      max_attempts: number;
      backoff_multiplier: number;
    };
  };
}

export class PlatformConfigManager {
  private config: PostmasterConfig | null = null;
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || this.findConfigFile();
  }

  /**
   * Find configuration file in standard locations
   */
  private findConfigFile(): string {
    const possiblePaths = [
      join(process.cwd(), 'config', 'platforms.yml'),
      join(process.cwd(), 'config', 'platforms.yaml'),
      join(process.cwd(), 'platforms.yml'),
      join(process.cwd(), 'platforms.yaml'),
      join(process.cwd(), 'config', 'platforms.json'),
      join(process.cwd(), 'platforms.json'),
    ];

    for (const path of possiblePaths) {
      if (existsSync(path)) {
        return path;
      }
    }

    throw new Error(`Platform configuration file not found. Searched: ${possiblePaths.join(', ')}`);
  }

  /**
   * Load and parse configuration file
   */
  loadConfig(): PostmasterConfig {
    if (this.config) {
      return this.config;
    }

    try {
      if (!existsSync(this.configPath)) {
        throw new Error(`Configuration file not found: ${this.configPath}`);
      }

      const fileContent = readFileSync(this.configPath, 'utf8');
      
      // Parse based on file extension
      if (this.configPath.endsWith('.json')) {
        this.config = JSON.parse(fileContent);
      } else if (this.configPath.endsWith('.yml') || this.configPath.endsWith('.yaml')) {
        this.config = yaml.load(fileContent) as PostmasterConfig;
      } else {
        throw new Error(`Unsupported configuration file format: ${this.configPath}`);
      }

      // Validate configuration
      this.validateConfig(this.config!);
      
      // Apply environment variable substitution
      this.config = this.substituteEnvironmentVariables(this.config!);

      workerLogger.info('Platform configuration loaded successfully', {
        configPath: this.configPath,
        platforms: Object.keys(this.config.platforms),
        totalTargets: Object.values(this.config.platforms).reduce((sum, targets) => sum + targets.length, 0),
      });

      return this.config;

    } catch (error) {
      workerLogger.error('Failed to load platform configuration', {
        configPath: this.configPath,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get configuration for a specific platform
   */
  getPlatformConfig(platform: string): PlatformTargetConfig[] {
    const config = this.loadConfig();
    return config.platforms[platform] || [];
  }

  /**
   * Get all active platforms
   */
  getActivePlatforms(): string[] {
    const config = this.loadConfig();
    return Object.keys(config.platforms).filter(platform => {
      const targets = config.platforms[platform];
      return targets.some(target => target.active !== false);
    });
  }

  /**
   * Get all active targets across all platforms
   */
  getAllActiveTargets(): Array<PlatformTargetConfig & { platform: string }> {
    const config = this.loadConfig();
    const activeTargets: Array<PlatformTargetConfig & { platform: string }> = [];

    for (const [platform, targets] of Object.entries(config.platforms)) {
      for (const target of targets) {
        if (target.active !== false) {
          activeTargets.push({ ...target, platform });
        }
      }
    }

    return activeTargets;
  }

  /**
   * Validate configuration structure
   */
  private validateConfig(config: PostmasterConfig): void {
    if (!config.platforms || typeof config.platforms !== 'object') {
      throw new Error('Configuration must have a "platforms" object');
    }

    const supportedPlatforms = ['slack', 'discord', 'telegram', 'twitter'];
    
    for (const [platform, targets] of Object.entries(config.platforms)) {
      if (!supportedPlatforms.includes(platform)) {
        workerLogger.warn(`Unsupported platform in configuration: ${platform}`);
      }

      if (!Array.isArray(targets)) {
        throw new Error(`Platform "${platform}" must have an array of targets`);
      }

      for (const [index, target] of targets.entries()) {
        if (!target.name) {
          throw new Error(`Target ${index} in platform "${platform}" must have a name`);
        }

        // Platform-specific validation
        this.validatePlatformTarget(platform, target, index);
      }
    }
  }

  /**
   * Validate platform-specific target configuration
   */
  private validatePlatformTarget(platform: string, target: PlatformTargetConfig, index: number): void {
    const targetId = `${platform}[${index}]`;

    switch (platform) {
      case 'slack':
      case 'discord':
        if (!target.webhook_url) {
          throw new Error(`${targetId}: webhook_url is required for ${platform}`);
        }
        break;

      case 'telegram':
        if (!target.bot_token) {
          throw new Error(`${targetId}: bot_token is required for Telegram`);
        }
        if (!target.chat_id) {
          throw new Error(`${targetId}: chat_id is required for Telegram`);
        }
        break;

      case 'twitter':
        if (!target.api_key || !target.api_secret || !target.access_token || !target.access_secret) {
          throw new Error(`${targetId}: api_key, api_secret, access_token, and access_secret are required for Twitter`);
        }
        break;
    }
  }

  /**
   * Substitute environment variables in configuration
   */
  private substituteEnvironmentVariables(config: PostmasterConfig): PostmasterConfig {
    const configStr = JSON.stringify(config);
    const substituted = configStr.replace(/\$\{([^}]+)\}/g, (match, envVar) => {
      const value = process.env[envVar];
      if (value === undefined) {
        workerLogger.warn(`Environment variable not found: ${envVar}`);
        return match; // Keep original if not found
      }
      return value;
    });

    return JSON.parse(substituted);
  }

  /**
   * Reload configuration (useful for hot-reloading)
   */
  reloadConfig(): PostmasterConfig {
    this.config = null;
    return this.loadConfig();
  }

  /**
   * Check if any platforms are configured
   */
  hasConfiguredPlatforms(): boolean {
    try {
      const config = this.loadConfig();
      return this.getActivePlatforms().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get configuration summary for logging/debugging
   */
  getConfigSummary(): Record<string, any> {
    try {
      const config = this.loadConfig();
      const summary: Record<string, any> = {};

      for (const [platform, targets] of Object.entries(config.platforms)) {
        summary[platform] = {
          totalTargets: targets.length,
          activeTargets: targets.filter(t => t.active !== false).length,
          targetNames: targets.map(t => t.name),
        };
      }

      return {
        configPath: this.configPath,
        platforms: summary,
        totalActivePlatforms: this.getActivePlatforms().length,
        totalActiveTargets: this.getAllActiveTargets().length,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
        configPath: this.configPath,
      };
    }
  }
}

// Singleton instance
export const platformConfigManager = new PlatformConfigManager();
