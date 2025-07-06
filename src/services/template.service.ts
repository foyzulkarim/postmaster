import { MessageTemplate } from '@prisma/client';
import { BroadcastMessage } from '../api/v1/broadcast/broadcast.schema';
import { FormattedMessage } from './message-formatter.service';
import { databaseService } from './db.service';
import { TemplateError, ErrorType } from '../types/errors.types';
import { serviceLogger } from '../utils/logger';

export interface TemplateVariables {
  [key: string]: any;
}

export interface TemplateRenderContext {
  message: BroadcastMessage;
  platform: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export class TemplateService {
  /**
   * Render template with variables
   */
  async renderTemplate(
    templateName: string,
    platform: string,
    variables: TemplateVariables,
    context?: TemplateRenderContext
  ): Promise<FormattedMessage> {
    try {
      serviceLogger.debug('Rendering template', {
        templateName,
        platform,
        variableKeys: Object.keys(variables),
      });

      // Get template from database
      const template = await this.getTemplate(templateName, platform);
      
      if (!template) {
        throw new TemplateError(
          `Template '${templateName}' not found for platform '${platform}'`,
          templateName,
          ErrorType.TEMPLATE_NOT_FOUND
        );
      }

      // Parse template data
      const templateData = this.parseTemplateData(template.template, templateName);
      const requiredVars = this.parseRequiredVariables(template.variables, templateName);
      
      // Validate required variables
      this.validateVariables(requiredVars, variables, templateName);
      
      // Merge with context variables if provided
      const allVariables = this.mergeVariables(variables, context);
      
      // Render template with variables
      const renderedTemplate = this.renderTemplateData(templateData, allVariables, templateName);
      
      serviceLogger.debug('Template rendered successfully', {
        templateName,
        platform,
        renderedContentLength: renderedTemplate.content?.length || 0,
      });

      return renderedTemplate;
      
    } catch (error) {
      if (error instanceof TemplateError) {
        throw error;
      }
      
      serviceLogger.error('Error rendering template', {
        templateName,
        platform,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      throw new TemplateError(
        `Failed to render template '${templateName}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        templateName,
        ErrorType.TEMPLATE_RENDER_ERROR
      );
    }
  }

  /**
   * Get template from database
   */
  private async getTemplate(templateName: string, platform: string): Promise<MessageTemplate | null> {
    try {
      return await databaseService.findTemplate(templateName, platform);
    } catch (error) {
      serviceLogger.error('Error fetching template from database', {
        templateName,
        platform,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Parse template data from JSON string
   */
  private parseTemplateData(templateJson: string, templateName: string): any {
    try {
      return JSON.parse(templateJson);
    } catch (error) {
      throw new TemplateError(
        `Invalid template JSON for '${templateName}': ${error instanceof Error ? error.message : 'Parse error'}`,
        templateName,
        ErrorType.TEMPLATE_RENDER_ERROR
      );
    }
  }

  /**
   * Parse required variables from JSON string
   */
  private parseRequiredVariables(variablesJson: string, templateName: string): string[] {
    try {
      const parsed = JSON.parse(variablesJson);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      serviceLogger.warn('Invalid variables JSON, using empty array', {
        templateName,
        error: error instanceof Error ? error.message : 'Parse error',
      });
      return [];
    }
  }

  /**
   * Validate required variables are provided
   */
  private validateVariables(
    required: string[],
    provided: TemplateVariables,
    templateName: string
  ): void {
    const missing = required.filter(key => {
      const value = provided[key];
      return value === undefined || value === null || value === '';
    });
    
    if (missing.length > 0) {
      throw new TemplateError(
        `Missing required template variables for '${templateName}': ${missing.join(', ')}`,
        templateName,
        ErrorType.MISSING_TEMPLATE_VARIABLES
      );
    }
  }

  /**
   * Merge variables with context
   */
  private mergeVariables(
    variables: TemplateVariables,
    context?: TemplateRenderContext
  ): TemplateVariables {
    const merged = { ...variables };
    
    if (context) {
      // Add context variables
      merged.timestamp = context.timestamp;
      merged.platform = context.platform;
      
      // Add message fields
      if (context.message) {
        merged.title = context.message.title || '';
        merged.content = context.message.content || '';
        merged.format = context.message.format || 'plain';
      }
      
      // Add metadata
      if (context.metadata) {
        Object.assign(merged, context.metadata);
      }
    }
    
    return merged;
  }

  /**
   * Render template data with variables
   */
  private renderTemplateData(
    templateData: any,
    variables: TemplateVariables,
    templateName: string
  ): FormattedMessage {
    try {
      // Deep clone template data to avoid mutations
      const rendered = this.deepClone(templateData);
      
      // Recursively replace variables in the template
      this.replaceVariables(rendered, variables);
      
      return rendered as FormattedMessage;
      
    } catch (error) {
      throw new TemplateError(
        `Error rendering template data for '${templateName}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        templateName,
        ErrorType.TEMPLATE_RENDER_ERROR
      );
    }
  }

  /**
   * Deep clone object
   */
  private deepClone(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    if (obj instanceof Date) {
      return new Date(obj.getTime());
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.deepClone(item));
    }
    
    const cloned: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = this.deepClone(obj[key]);
      }
    }
    
    return cloned;
  }

  /**
   * Recursively replace variables in template data
   */
  private replaceVariables(obj: any, variables: TemplateVariables): any {
    if (typeof obj === 'string') {
      return this.replaceStringVariables(obj, variables);
    }
    
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        if (typeof obj[i] === 'string') {
          obj[i] = this.replaceStringVariables(obj[i], variables);
        } else if (typeof obj[i] === 'object' && obj[i] !== null) {
          this.replaceVariables(obj[i], variables);
        }
      }
      return;
    }
    
    if (typeof obj === 'object' && obj !== null) {
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          if (typeof obj[key] === 'string') {
            obj[key] = this.replaceStringVariables(obj[key], variables);
          } else if (typeof obj[key] === 'object' && obj[key] !== null) {
            this.replaceVariables(obj[key], variables);
          }
        }
      }
    }
  }

  /**
   * Replace variables in a string using {{variable}} syntax
   */
  private replaceStringVariables(str: string, variables: TemplateVariables): string {
    return str.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      const value = variables[varName];
      
      if (value === undefined || value === null) {
        serviceLogger.warn('Template variable not found, keeping placeholder', {
          variable: varName,
          placeholder: match,
        });
        return match; // Keep the placeholder if variable not found
      }
      
      return String(value);
    });
  }

  /**
   * Create template variables from message and metadata
   */
  createTemplateVariables(
    message: BroadcastMessage,
    metadata?: Record<string, any>
  ): TemplateVariables {
    const variables: TemplateVariables = {
      title: message.title || '',
      content: message.content,
      format: message.format || 'plain',
      timestamp: new Date().toISOString(),
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString(),
    };

    // Add metadata if provided
    if (metadata) {
      Object.assign(variables, metadata);
    }

    return variables;
  }

  /**
   * List available templates for a platform
   */
  async listTemplates(platform?: string): Promise<MessageTemplate[]> {
    try {
      return await databaseService.findTemplatesByPlatform(platform);
    } catch (error) {
      serviceLogger.error('Error listing templates', {
        platform,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Create a new template
   */
  async createTemplate(
    name: string,
    platform: string,
    template: any,
    variables: string[] = []
  ): Promise<MessageTemplate> {
    try {
      // Validate template JSON
      const templateJson = JSON.stringify(template);
      const variablesJson = JSON.stringify(variables);
      
      // Test template rendering with dummy variables
      const dummyVars: TemplateVariables = {};
      variables.forEach(varName => {
        dummyVars[varName] = `{{${varName}}}`;
      });
      
      // Validate template can be rendered
      this.renderTemplateData(template, dummyVars, name);
      
      return await databaseService.createTemplate({
        name,
        platform,
        template: templateJson,
        variables: variablesJson,
        active: true,
      });
      
    } catch (error) {
      serviceLogger.error('Error creating template', {
        name,
        platform,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Update an existing template
   */
  async updateTemplate(
    name: string,
    platform: string,
    updates: Partial<{
      template: any;
      variables: string[];
      active: boolean;
    }>
  ): Promise<MessageTemplate> {
    try {
      const updateData: any = {};
      
      if (updates.template !== undefined) {
        updateData.template = JSON.stringify(updates.template);
      }
      
      if (updates.variables !== undefined) {
        updateData.variables = JSON.stringify(updates.variables);
      }
      
      if (updates.active !== undefined) {
        updateData.active = updates.active;
      }
      
      return await databaseService.updateTemplate(name, platform, updateData);
      
    } catch (error) {
      serviceLogger.error('Error updating template', {
        name,
        platform,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Delete a template
   */
  async deleteTemplate(name: string, platform: string): Promise<void> {
    try {
      await databaseService.deleteTemplate(name, platform);
      
      serviceLogger.info('Template deleted', {
        name,
        platform,
      });
      
    } catch (error) {
      serviceLogger.error('Error deleting template', {
        name,
        platform,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get template service statistics
   */
  async getStats() {
    try {
      const templates = await this.listTemplates();
      const platformCounts = templates.reduce((acc, template) => {
        acc[template.platform] = (acc[template.platform] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      return {
        totalTemplates: templates.length,
        activeTemplates: templates.filter(t => t.active).length,
        platformCounts,
        platforms: Object.keys(platformCounts),
      };
      
    } catch (error) {
      serviceLogger.error('Error getting template stats', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return {
        totalTemplates: 0,
        activeTemplates: 0,
        platformCounts: {},
        platforms: [],
      };
    }
  }
}

export default TemplateService;
