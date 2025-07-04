import { TemplateService } from '../../../src/services/template.service';
import { BroadcastMessage } from '../../../src/api/v1/broadcast/broadcast.schema';
import { TemplateError, ErrorType } from '../../../src/types/errors.types';

// Mock database service
jest.mock('../../../src/services/db.service', () => ({
  databaseService: {
    findTemplate: jest.fn(),
    findTemplatesByPlatform: jest.fn(),
    createTemplate: jest.fn(),
    updateTemplate: jest.fn(),
    deleteTemplate: jest.fn(),
  },
}));

import { databaseService } from '../../../src/services/db.service';

describe('TemplateService', () => {
  let service: TemplateService;
  const mockDatabaseService = databaseService as jest.Mocked<typeof databaseService>;

  beforeEach(() => {
    service = new TemplateService();
    jest.clearAllMocks();
  });

  describe('renderTemplate', () => {
    const mockTemplate = {
      id: 1,
      name: 'test-template',
      platform: 'slack',
      template: JSON.stringify({
        text: 'Hello {{name}}!',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'Message: {{message}}',
            },
          },
        ],
      }),
      variables: JSON.stringify(['name', 'message']),
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should render template successfully', async () => {
      mockDatabaseService.findTemplate.mockResolvedValue(mockTemplate);

      const variables = { name: 'John', message: 'Hello World' };
      const result = await service.renderTemplate('test-template', 'slack', variables);

      expect(result.text).toBe('Hello John!');
      expect(result.blocks[0].text.text).toBe('Message: Hello World');
    });

    it('should throw error when template not found', async () => {
      mockDatabaseService.findTemplate.mockResolvedValue(null);

      await expect(
        service.renderTemplate('nonexistent', 'slack', {})
      ).rejects.toThrow(TemplateError);
    });

    it('should throw error for missing required variables', async () => {
      mockDatabaseService.findTemplate.mockResolvedValue(mockTemplate);

      await expect(
        service.renderTemplate('test-template', 'slack', { name: 'John' }) // missing 'message'
      ).rejects.toThrow(TemplateError);
    });

    it('should handle invalid template JSON', async () => {
      const invalidTemplate = {
        ...mockTemplate,
        template: 'invalid json',
      };
      mockDatabaseService.findTemplate.mockResolvedValue(invalidTemplate);

      await expect(
        service.renderTemplate('test-template', 'slack', { name: 'John', message: 'Hello' })
      ).rejects.toThrow(TemplateError);
    });

    it('should merge context variables', async () => {
      const templateWithContext = {
        ...mockTemplate,
        template: JSON.stringify({
          text: 'Hello {{name}}! Time: {{timestamp}}',
        }),
        variables: JSON.stringify(['name']),
      };
      mockDatabaseService.findTemplate.mockResolvedValue(templateWithContext);

      const context = {
        message: { content: 'test' } as BroadcastMessage,
        platform: 'slack',
        timestamp: '2023-01-01T00:00:00Z',
      };

      const result = await service.renderTemplate('test-template', 'slack', { name: 'John' }, context);

      expect(result.text).toBe('Hello John! Time: 2023-01-01T00:00:00Z');
    });
  });

  describe('createTemplateVariables', () => {
    it('should create variables from message', () => {
      const message: BroadcastMessage = {
        title: 'Test Title',
        content: 'Test content',
        format: 'markdown',
      };

      const variables = service.createTemplateVariables(message);

      expect(variables.title).toBe('Test Title');
      expect(variables.content).toBe('Test content');
      expect(variables.format).toBe('markdown');
      expect(variables.timestamp).toBeDefined();
      expect(variables.date).toBeDefined();
      expect(variables.time).toBeDefined();
    });

    it('should handle message without title', () => {
      const message: BroadcastMessage = {
        content: 'Test content',
      };

      const variables = service.createTemplateVariables(message);

      expect(variables.title).toBe('');
      expect(variables.format).toBe('plain');
    });

    it('should include metadata', () => {
      const message: BroadcastMessage = {
        content: 'Test content',
      };
      const metadata = { source: 'test-app', user_id: '123' };

      const variables = service.createTemplateVariables(message, metadata);

      expect(variables.source).toBe('test-app');
      expect(variables.user_id).toBe('123');
    });
  });

  describe('replaceStringVariables', () => {
    it('should replace variables in string', () => {
      const template = 'Hello {{name}}! Your score is {{score}}.';
      const variables = { name: 'John', score: '95' };

      const result = service['replaceStringVariables'](template, variables);

      expect(result).toBe('Hello John! Your score is 95.');
    });

    it('should keep placeholder for missing variables', () => {
      const template = 'Hello {{name}}! Your score is {{score}}.';
      const variables = { name: 'John' };

      const result = service['replaceStringVariables'](template, variables);

      expect(result).toBe('Hello John! Your score is {{score}}.');
    });

    it('should handle multiple occurrences of same variable', () => {
      const template = '{{name}} said: "Hello {{name}}!"';
      const variables = { name: 'John' };

      const result = service['replaceStringVariables'](template, variables);

      expect(result).toBe('John said: "Hello John!"');
    });
  });

  describe('deepClone', () => {
    it('should clone simple object', () => {
      const obj = { a: 1, b: 'test' };
      const cloned = service['deepClone'](obj);

      expect(cloned).toEqual(obj);
      expect(cloned).not.toBe(obj);
    });

    it('should clone nested object', () => {
      const obj = { a: { b: { c: 'deep' } } };
      const cloned = service['deepClone'](obj);

      expect(cloned).toEqual(obj);
      expect(cloned.a).not.toBe(obj.a);
      expect(cloned.a.b).not.toBe(obj.a.b);
    });

    it('should clone array', () => {
      const arr = [1, { a: 'test' }, [2, 3]];
      const cloned = service['deepClone'](arr);

      expect(cloned).toEqual(arr);
      expect(cloned).not.toBe(arr);
      expect(cloned[1]).not.toBe(arr[1]);
    });

    it('should handle null and primitives', () => {
      expect(service['deepClone'](null)).toBe(null);
      expect(service['deepClone'](42)).toBe(42);
      expect(service['deepClone']('test')).toBe('test');
      expect(service['deepClone'](true)).toBe(true);
    });

    it('should clone Date objects', () => {
      const date = new Date('2023-01-01');
      const cloned = service['deepClone'](date);

      expect(cloned).toEqual(date);
      expect(cloned).not.toBe(date);
      expect(cloned instanceof Date).toBe(true);
    });
  });

  describe('listTemplates', () => {
    it('should list all templates', async () => {
      const mockTemplates = [
        { id: 1, name: 'template1', platform: 'slack' },
        { id: 2, name: 'template2', platform: 'discord' },
      ];
      mockDatabaseService.findTemplatesByPlatform.mockResolvedValue(mockTemplates as any);

      const result = await service.listTemplates();

      expect(result).toEqual(mockTemplates);
      expect(mockDatabaseService.findTemplatesByPlatform).toHaveBeenCalledWith(undefined);
    });

    it('should list templates for specific platform', async () => {
      const mockTemplates = [
        { id: 1, name: 'template1', platform: 'slack' },
      ];
      mockDatabaseService.findTemplatesByPlatform.mockResolvedValue(mockTemplates as any);

      const result = await service.listTemplates('slack');

      expect(result).toEqual(mockTemplates);
      expect(mockDatabaseService.findTemplatesByPlatform).toHaveBeenCalledWith('slack');
    });
  });

  describe('createTemplate', () => {
    it('should create template successfully', async () => {
      const mockCreatedTemplate = {
        id: 1,
        name: 'new-template',
        platform: 'slack',
        template: '{"text":"Hello {{name}}!"}',
        variables: '["name"]',
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockDatabaseService.createTemplate.mockResolvedValue(mockCreatedTemplate);

      const template = { text: 'Hello {{name}}!' };
      const variables = ['name'];

      const result = await service.createTemplate('new-template', 'slack', template, variables);

      expect(result).toEqual(mockCreatedTemplate);
      expect(mockDatabaseService.createTemplate).toHaveBeenCalledWith({
        name: 'new-template',
        platform: 'slack',
        template: JSON.stringify(template),
        variables: JSON.stringify(variables),
        active: true,
      });
    });
  });

  describe('updateTemplate', () => {
    it('should update template successfully', async () => {
      const mockUpdatedTemplate = {
        id: 1,
        name: 'updated-template',
        platform: 'slack',
        template: '{"text":"Updated {{name}}!"}',
        variables: '["name"]',
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockDatabaseService.updateTemplate.mockResolvedValue(mockUpdatedTemplate);

      const updates = {
        template: { text: 'Updated {{name}}!' },
        active: false,
      };

      const result = await service.updateTemplate('updated-template', 'slack', updates);

      expect(result).toEqual(mockUpdatedTemplate);
      expect(mockDatabaseService.updateTemplate).toHaveBeenCalledWith(
        'updated-template',
        'slack',
        {
          template: JSON.stringify(updates.template),
          active: false,
        }
      );
    });
  });

  describe('deleteTemplate', () => {
    it('should delete template successfully', async () => {
      mockDatabaseService.deleteTemplate.mockResolvedValue(undefined);

      await expect(service.deleteTemplate('test-template', 'slack')).resolves.not.toThrow();

      expect(mockDatabaseService.deleteTemplate).toHaveBeenCalledWith('test-template', 'slack');
    });
  });

  describe('getStats', () => {
    it('should return template statistics', async () => {
      const mockTemplates = [
        { id: 1, name: 'template1', platform: 'slack', active: true },
        { id: 2, name: 'template2', platform: 'discord', active: true },
        { id: 3, name: 'template3', platform: 'slack', active: false },
      ];
      mockDatabaseService.findTemplatesByPlatform.mockResolvedValue(mockTemplates as any);

      const stats = await service.getStats();

      expect(stats.totalTemplates).toBe(3);
      expect(stats.activeTemplates).toBe(2);
      expect(stats.platformCounts.slack).toBe(2);
      expect(stats.platformCounts.discord).toBe(1);
      expect(stats.platforms).toContain('slack');
      expect(stats.platforms).toContain('discord');
    });

    it('should handle errors gracefully', async () => {
      mockDatabaseService.findTemplatesByPlatform.mockRejectedValue(new Error('Database error'));

      const stats = await service.getStats();

      expect(stats.totalTemplates).toBe(0);
      expect(stats.activeTemplates).toBe(0);
      expect(stats.platformCounts).toEqual({});
      expect(stats.platforms).toEqual([]);
    });
  });
});
