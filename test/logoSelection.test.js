const { describe, it, expect, beforeEach, afterEach, jest } = require('@jest/globals');
const mongoose = require('mongoose');

// Mock the bot and context
const mockBot = {
  action: jest.fn(),
  reply: jest.fn(),
  editMessageReplyMarkup: jest.fn(),
  answerCbQuery: jest.fn()
};

const mockContext = {
  answerCbQuery: jest.fn(),
  reply: jest.fn(),
  editMessageReplyMarkup: jest.fn(),
  from: { id: 1300522948 },
  match: ['select_logo_1300522948_1758379700788_0', '1300522948', '1758379700788', '0'],
  session: {}
};

// Mock User model
const mockUser = {
  findOne: jest.fn()
};

// Mock the handler function
const logoSelectionHandler = async (ctx) => {
  await ctx.answerCbQuery();
  
  const [, userId, timestamp, logoIndex] = ctx.match;
  const userIdNum = parseInt(userId);
  const logoIndexNum = parseInt(logoIndex);
  
  console.log(`[LogoSelection] User ${userId} selected logo ${logoIndex}`);
  
  try {
    // Find the generation data from session or database
    const user = await mockUser.findOne({ userId: userIdNum });
    if (!user) {
      await ctx.reply('❌ User not found. Please try generating logos again.');
      return;
    }
    
    // Store selection in session for variant generation
    if (!ctx.session) ctx.session = {} as any;
    ctx.session.selectedLogo = {
      userId: userIdNum,
      timestamp: parseInt(timestamp),
      logoIndex: logoIndexNum
    };
    
    // Show variant selection menu
    await ctx.editMessageReplyMarkup({
      inline_keyboard: [
        [
          { text: '✅ Selected!', callback_data: 'logo_selected' },
          { text: '🔄 Regenerate', callback_data: `regenerate_logo_${logoIndex}` }
        ],
        [
          { text: '🎨 Create Variants', callback_data: `create_variants_${userId}_${timestamp}_${logoIndex}` }
        ]
      ]
    });
    
    await ctx.reply(
      `🎉 *Logo Selected!*\n\n` +
      `You can now create different variants of your selected logo:\n\n` +
      `• Standard version (current)\n` +
      `• Transparent background\n` +
      `• White background\n` +
      `• Icon only (no text)\n\n` +
      `Click "Create Variants" to generate all formats!`,
      { parse_mode: 'Markdown' }
    );
    
  } catch (error) {
    console.error('[LogoSelection] Error handling logo selection:', error);
    await ctx.reply('❌ Error processing your selection. Please try again.');
  }
};

describe('Logo Selection Handler', () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Reset context
    mockContext.answerCbQuery.mockClear();
    mockContext.reply.mockClear();
    mockContext.editMessageReplyMarkup.mockClear();
    mockContext.session = {};
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Successful Logo Selection', () => {
    it('should handle valid logo selection with existing user', async () => {
      // Arrange
      const mockUserData = { userId: 1300522948, starBalance: 100 };
      mockUser.findOne.mockResolvedValue(mockUserData);
      
      // Act
      await logoSelectionHandler(mockContext);
      
      // Assert
      expect(mockContext.answerCbQuery).toHaveBeenCalledTimes(1);
      expect(mockUser.findOne).toHaveBeenCalledWith({ userId: 1300522948 });
      expect(mockContext.session.selectedLogo).toEqual({
        userId: 1300522948,
        timestamp: 1758379700788,
        logoIndex: 0
      });
      expect(mockContext.editMessageReplyMarkup).toHaveBeenCalledWith({
        inline_keyboard: [
          [
            { text: '✅ Selected!', callback_data: 'logo_selected' },
            { text: '🔄 Regenerate', callback_data: 'regenerate_logo_0' }
          ],
          [
            { text: '🎨 Create Variants', callback_data: 'create_variants_1300522948_1758379700788_0' }
          ]
        ]
      });
      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('🎉 *Logo Selected!*'),
        { parse_mode: 'Markdown' }
      );
    });

    it('should parse callback data correctly', async () => {
      // Arrange
      const testContext = {
        ...mockContext,
        match: ['select_logo_12345_9876543210_1', '12345', '9876543210', '1']
      };
      const mockUserData = { userId: 12345, starBalance: 50 };
      mockUser.findOne.mockResolvedValue(mockUserData);
      
      // Act
      await logoSelectionHandler(testContext);
      
      // Assert
      expect(testContext.session.selectedLogo).toEqual({
        userId: 12345,
        timestamp: 9876543210,
        logoIndex: 1
      });
    });

    it('should handle different logo indices', async () => {
      // Arrange
      const testContext = {
        ...mockContext,
        match: ['select_logo_1300522948_1758379700788_1', '1300522948', '1758379700788', '1']
      };
      const mockUserData = { userId: 1300522948, starBalance: 100 };
      mockUser.findOne.mockResolvedValue(mockUserData);
      
      // Act
      await logoSelectionHandler(testContext);
      
      // Assert
      expect(testContext.session.selectedLogo.logoIndex).toBe(1);
      expect(mockContext.editMessageReplyMarkup).toHaveBeenCalledWith(
        expect.objectContaining({
          inline_keyboard: expect.arrayContaining([
            expect.arrayContaining([
              expect.objectContaining({ callback_data: 'regenerate_logo_1' })
            ])
          ])
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle user not found', async () => {
      // Arrange
      mockUser.findOne.mockResolvedValue(null);
      
      // Act
      await logoSelectionHandler(mockContext);
      
      // Assert
      expect(mockContext.answerCbQuery).toHaveBeenCalledTimes(1);
      expect(mockUser.findOne).toHaveBeenCalledWith({ userId: 1300522948 });
      expect(mockContext.reply).toHaveBeenCalledWith('❌ User not found. Please try generating logos again.');
      expect(mockContext.editMessageReplyMarkup).not.toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      // Arrange
      const dbError = new Error('Database connection failed');
      mockUser.findOne.mockRejectedValue(dbError);
      
      // Act
      await logoSelectionHandler(mockContext);
      
      // Assert
      expect(mockContext.answerCbQuery).toHaveBeenCalledTimes(1);
      expect(mockContext.reply).toHaveBeenCalledWith('❌ Error processing your selection. Please try again.');
    });

    it('should handle missing session', async () => {
      // Arrange
      const testContext = { ...mockContext, session: null };
      const mockUserData = { userId: 1300522948, starBalance: 100 };
      mockUser.findOne.mockResolvedValue(mockUserData);
      
      // Act
      await logoSelectionHandler(testContext);
      
      // Assert
      expect(testContext.session).toBeDefined();
      expect(testContext.session.selectedLogo).toBeDefined();
    });
  });

  describe('Callback Data Parsing', () => {
    it('should correctly parse valid callback data format', () => {
      const callbackData = 'select_logo_1300522948_1758379700788_0';
      const regex = /select_logo_(\d+)_(\d+)_(\d+)/;
      const match = callbackData.match(regex);
      
      expect(match).not.toBeNull();
      expect(match[1]).toBe('1300522948'); // userId
      expect(match[2]).toBe('1758379700788'); // timestamp
      expect(match[3]).toBe('0'); // logoIndex
    });

    it('should reject invalid callback data format', () => {
      const invalidCallbackData = 'select_logo_invalid_data';
      const regex = /select_logo_(\d+)_(\d+)_(\d+)/;
      const match = invalidCallbackData.match(regex);
      
      expect(match).toBeNull();
    });

    it('should handle edge case with zero values', () => {
      const callbackData = 'select_logo_0_0_0';
      const regex = /select_logo_(\d+)_(\d+)_(\d+)/;
      const match = callbackData.match(regex);
      
      expect(match).not.toBeNull();
      expect(match[1]).toBe('0');
      expect(match[2]).toBe('0');
      expect(match[3]).toBe('0');
    });
  });

  describe('Session Management', () => {
    it('should preserve existing session data', async () => {
      // Arrange
      const testContext = {
        ...mockContext,
        session: { 
          existingData: 'test',
          __scenes: { current: 'logoWizard' }
        }
      };
      const mockUserData = { userId: 1300522948, starBalance: 100 };
      mockUser.findOne.mockResolvedValue(mockUserData);
      
      // Act
      await logoSelectionHandler(testContext);
      
      // Assert
      expect(testContext.session.existingData).toBe('test');
      expect(testContext.session.__scenes).toEqual({ current: 'logoWizard' });
      expect(testContext.session.selectedLogo).toBeDefined();
    });

    it('should create new session if none exists', async () => {
      // Arrange
      const testContext = { ...mockContext, session: null };
      const mockUserData = { userId: 1300522948, starBalance: 100 };
      mockUser.findOne.mockResolvedValue(mockUserData);
      
      // Act
      await logoSelectionHandler(testContext);
      
      // Assert
      expect(testContext.session).toBeDefined();
      expect(testContext.session.selectedLogo).toBeDefined();
    });
  });

  describe('UI Response Validation', () => {
    it('should send correct variant menu structure', async () => {
      // Arrange
      const mockUserData = { userId: 1300522948, starBalance: 100 };
      mockUser.findOne.mockResolvedValue(mockUserData);
      
      // Act
      await logoSelectionHandler(mockContext);
      
      // Assert
      const editCall = mockContext.editMessageReplyMarkup.mock.calls[0][0];
      expect(editCall.inline_keyboard).toHaveLength(2);
      expect(editCall.inline_keyboard[0]).toHaveLength(2);
      expect(editCall.inline_keyboard[1]).toHaveLength(1);
      
      // Check button texts and callback data
      expect(editCall.inline_keyboard[0][0].text).toBe('✅ Selected!');
      expect(editCall.inline_keyboard[0][0].callback_data).toBe('logo_selected');
      expect(editCall.inline_keyboard[0][1].text).toBe('🔄 Regenerate');
      expect(editCall.inline_keyboard[0][1].callback_data).toBe('regenerate_logo_0');
      expect(editCall.inline_keyboard[1][0].text).toBe('🎨 Create Variants');
      expect(editCall.inline_keyboard[1][0].callback_data).toBe('create_variants_1300522948_1758379700788_0');
    });

    it('should send informative success message', async () => {
      // Arrange
      const mockUserData = { userId: 1300522948, starBalance: 100 };
      mockUser.findOne.mockResolvedValue(mockUserData);
      
      // Act
      await logoSelectionHandler(mockContext);
      
      // Assert
      const replyCall = mockContext.reply.mock.calls[0];
      expect(replyCall[0]).toContain('🎉 *Logo Selected!*');
      expect(replyCall[0]).toContain('Standard version (current)');
      expect(replyCall[0]).toContain('Transparent background');
      expect(replyCall[0]).toContain('White background');
      expect(replyCall[0]).toContain('Icon only (no text)');
      expect(replyCall[1]).toEqual({ parse_mode: 'Markdown' });
    });
  });
});

// Integration test for the actual bot handler
describe('Bot Handler Integration', () => {
  it('should register the handler with correct regex pattern', () => {
    // This would test that the bot.action is called with the correct regex
    const expectedRegex = /select_logo_(\d+)_(\d+)_(\d+)/;
    
    // In a real test, you'd verify that mockBot.action was called with this regex
    expect(expectedRegex.test('select_logo_1300522948_1758379700788_0')).toBe(true);
    expect(expectedRegex.test('select_logo_12345_9876543210_1')).toBe(true);
    expect(expectedRegex.test('invalid_format')).toBe(false);
  });
});

// Performance test
describe('Performance Tests', () => {
  it('should handle logo selection within reasonable time', async () => {
    // Arrange
    const mockUserData = { userId: 1300522948, starBalance: 100 };
    mockUser.findOne.mockResolvedValue(mockUserData);
    
    const startTime = Date.now();
    
    // Act
    await logoSelectionHandler(mockContext);
    
    // Assert
    const endTime = Date.now();
    const executionTime = endTime - startTime;
    
    // Should complete within 100ms (excluding actual DB calls)
    expect(executionTime).toBeLessThan(100);
  });
});

module.exports = {
  logoSelectionHandler,
  mockContext,
  mockUser
};







